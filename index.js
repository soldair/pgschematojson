#!/usr/bin/env node
var spawn = require('child_process').spawn
var split = require('split')
var through = require('through')
var xtend = require('xtend')

var schema = {}
var state = 'out'
var table;

module.exports = function(schemaArg,cb){
  if(typeof schemaArg === 'function'){
    cb = schemaArg;
    schemaArg = false;
  };

  var s = split();
  s.pipe(through(function(data){
    if(state === "out"){
      if(data.indexOf('CREATE TABLE') > -1) {

        table = data.slice(data.indexOf('CREATE TABLE')+12,data.indexOf('(')-1).trim()
        schema[table] = {}
        state = "fields"
      } else if (data.indexOf('FOREIGN KEY') > -1){
        var constraintName = data.slice(data.indexOf('ADD CONSTRAINT ')+15,data.indexOf('FOREIGN')).trim()
        var field = data.slice(data.indexOf('FOREIGN KEY (')+13,data.indexOf(') REF'))
        var sourceTable = data.slice(data.indexOf('REFERENCES ')+11,data.lastIndexOf('('))
        var sourceField =  data.slice(data.lastIndexOf('(')+1,data.lastIndexOf(')'))

        var targetTable = constraintName.replace('_'+field+'_foreign','')

        schema[targetTable][field].fk = [sourceTable,sourceField];
        if(!schema[sourceTable][sourceField].dependents) schema[sourceTable][sourceField].dependents = [] 
        schema[sourceTable][sourceField].dependents.push([targetTable,field])
      } else if (data.indexOf('ADD CONSTRAINT') > -1){
        var type;
        if(data.indexOf('UNIQUE') > -1){
          //    ADD CONSTRAINT licenses_name_unique UNIQUE (name);
          type = 'UNIQUE'
        } else if(data.indexOf('PRIMARY KEY') > -1){
          type = 'PRIMARY KEY'
        }

        if(type) {
          var constraintName = data.slice(data.indexOf('ADD CONSTRAINT ')+15,data.indexOf(type)).trim()
          var typeKey = constraintName.split('_').pop();
          var fields = data.slice(data.indexOf(type+' (')+type.length+2,data.indexOf(')')).split(', ')
          var targetTable = constraintName.replace('_'+fields.join('_')+'_'+typeKey,'')
          // pkey doesnt have the field name in the constraint key
          if(targetTable.lastIndexOf('_'+typeKey) > -1) targetTable = targetTable.slice(0,targetTable.lastIndexOf('_'+typeKey))

          fields.forEach(function(field){
            schema[targetTable][field][typeKey] = fields.length>1?fields:true;
          })
        }
      }
      
    } else if(state === 'fields'){
      if(data.indexOf(');') > -1) return (state = 'out')

      var orig = data;
      data = data.replace(/,$/,'').trim().split(' ')
      var field = data[0];
      if(field === "CONSTRAINT"){
        var o = parseConstraint(orig);
        schema[table][o.field].check = o.check;
        return;
      }

      var type = data[1];
      if (data[2] && data[2].indexOf('varying') > -1){
        type = data[2].slice(data[2].indexOf('(')+1,data[2].indexOf(')'));
      }

      var _null = true;
      if(data[data.length-1] === 'NULL') _null = false

      schema[table][field] = {type:type,null:_null}

    }
  })).on('end',function(){
    var c = cb;
    cb = function(){}
    c(false,schema);
  }).on('error',function(err){
    var c = cb;
    cb = function(){}
    c(err);
  })
  
  /// if the data is passed as an agument
  if(schemaArg){
    s.write(schemaArg);
    s.end()
  } else {
    return s;
  }
}


function parseConstraint(c){
  //"CONSTRAINT version_dependencies_type_check CHECK ((type = ANY (ARRAY['dependency'::text, 'dev'::text, 'optional'::text])))"
  var field = c.slice(c.indexOf('CHECK ((')+8,c.indexOf('=')-1).trim()
  var values = c.slice(c.indexOf('(ARRAY[')+7,c.indexOf(']')-1);
  values = values.split(",").map(function(v){
    return v.split('::').shift().replace(/'/g,'').trim()
  })
  // pull out just the first enum for now
  
  return {field:field,check:values};
}


module.exports.dump = function(config){
  config = config||{}; 
  if(typeof config === 'string') config = {database:config}

  var env = xtend({},process.env);
  var args = ['-w','--schema-only'];

  if(config.password) env.PGPASSWORD = config.password;
  if(config.host) args.push('-h'+config.host)
  if(config.user) args.push('-U'+config.user)
  if(config.database) args.push(config.database)

  var proc = spawn("pg_dump",args,{env:env})
  var ret = through()

  var exit;
  var err = []

  var c = 2
  var done = function(){
    if(--c) return
    ret.emit('end');
  }

  proc.stderr.on('data',function(data){
    err.push(data);
  }).on('error',function(){
    // nothing.
  })

  var errored = false;
  proc.stdout.on('end',function(){
    done();
  }).on('error',function(e){
    errored = true;
    ret.emit('error',e)
  })

  proc.on('exit',function(code){
    if(code && !errored) return ret.emit('error',new Error('pg_dump exit code '+code),Buffer.concat(err))
    done()
  })

  return proc.stdout.pipe(ret,{end:false});
}

if(require.main === module){
  process.stdin.pipe(module.exports(function(err,data){
    if(err) {
      process.stderr.write(err);
      process.exit(1);
    }

    console.log(JSON.stringify(data,null,'  '));
  }))
}
