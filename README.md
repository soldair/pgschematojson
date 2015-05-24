# pgschematojson

take postgres schema dump (--schema-only) and read it into a js object with keys and field types

can be used cli or a module.

```
pg_dump --schema-only databasename | pgschematojson
```

## install

```
sudo npm install -g pgschematojson
```

## api

### module.exports([schema],cb)
- schema, takes an optional schema string to parse 
- cb, the callback with the resultant data object.
- return value, if schema is not provided this returns a writeable stream which expects a piped stream of schema data

### module.exports.dump(config)
runs pg_dump with provided config
- config, {password:,user:,host:,database:}
- returns a stream of schema data
