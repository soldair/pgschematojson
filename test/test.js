var test = require('tape');
var parse = require('../');

var db = process.env.TESTDB||'test';

test("can dump",function(t){
  var out = [];
  parse.dump(db).on('data',function(data){
    out.push(data);
  }).on('end',function(){
    var result = Buffer.concat(data)+'';
    t.ok(result.indexOf('CREATE TABLE') > -1,'should have create table statement in dump')
    t.end(); 
  })
})

test("can",function(t){
  parse.dump(db).pipe(parse(function(err,result){
    t.ok(!err,'shoudl not have error')
    t.ok(result,'should have result')
    console.log(result)
    t.end()
  }))
})
