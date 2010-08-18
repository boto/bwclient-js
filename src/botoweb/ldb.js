/**
 * Configures and manages a local database via HTML5 Web Database.
 *
 * @author Ian Paterson
 */
botoweb.ldb = {
	/**
	 * The database name.
	 */
	name: null,
	/**
	 * The version of the API which generated the database.
	 */
	version: null,
	/**
	 * A human-friendly title for the database.
	 */
	title: null,
	/**
	 * An approximation of the database size in megabytes.
	 */
	size_mb: 1,
	/**
	 * The active local database handle.
	 * @type Database
	 */
	dbh: null,
	/**
	 * A map of the tables in the database.
	 */
	tables: {},

	/**
	 * Opens a connection to the local database and initializes the database
	 * schema based on the botoweb API.
	 */
	prepare: function (ready, error, attempts) {
		var db = botoweb.ldb.dbh;

		if (!db) {
			if (!window.openDatabase)
				return ready();

			var est_size = Math.round(botoweb.ldb.size_mb * 1024 * 1024);
			var version = botoweb.ldb.version.split(" ")[0];

			botoweb.ldb.dbh = db = window.openDatabase(
				botoweb.ldb.name,
				"",
				botoweb.ldb.title,
				est_size
			);
			if(db.version != version){
				if(!db.changeVersion){
					alert("ERROR: Your database is outdated and I can't upgrade it\nPlease remove your local DB manually and restart your browser");
				} else {
					alert("ERROR: Your database is outdated, attempting to update now");
					try{
						db.changeVersion(db.version, version, function(transaction){
							transaction.executeSql("select name from sqlite_master where type = ? ", ['table'], function(txn, results){
								for(var x=0; x< results.rows.length;  x++){
									var tbl_name = results.rows.item(x);
									if(tbl_name.name[0] != "_"){
										console.log("DROP TABLE " + tbl_name.name);
										txn.executeSql("DROP TABLE " + tbl_name.name, [], function(t, r){
											console.log("OK");
										});
									}
								}
							}, function(){
								// Failure
								alert("Changing Versions Failed!\nPlease remove your local DB manually and restart your browser");
								return;
							}, function(){
								// Success
								alert("Local DB successfully upgraded");
							});
						});
					} catch(e) {
						alert("Changing Versions Failed!\nPlease remove your local DB manually and restart your browser");
						return;
					}
				}
			}
		}

		// If the database does not open, try up to 10 times
		if (!db) {
			if (!attempts)
				attempts = 0;

			if (attempts > 10) {
				msg = "Your browser refuses to create our local DB\n";
				msg += "\nName: " + botoweb.ldb.name;
				msg += "\nVersion: " + version;
				msg += "\nTitle: " + botoweb.ldb.title;
				msg += "\nSize: " + est_size;
				error(msg);
				return;
			}

			setTimeout(function() {
				botoweb.ldb.prepare(ready, error, attempts + 1);
			}, 250);
			return;
		}

		if (botoweb.ldb.dbh) {
			if (botoweb.env.cfg.db.cache_props.length) {
				db.transaction(function (txn) {
					var setup_cache_props = function (txn) {
						txn.executeSql(
							'CREATE TABLE IF NOT EXISTS meta_cache_props' +
							' (id TEXT UNIQUE, prop_' + botoweb.env.cfg.db.cache_props.join(' TEXT, prop_') + ' TEXT)'
						);

						// Check the table schema for changes. If anything has changed
						// we need to reset and re-sync the table.
						txn.executeSql(
							'SELECT sql FROM sqlite_master WHERE type = ? AND tbl_name = ?',
							['table', 'meta_cache_props'],
							function (txn, results) {
								if (!results.rows.length)
									return;

								// Full CREATE TABLE... definition
								var schema = results.rows.item(0).sql;

								schema = schema.split('(')[1];
								var new_columns = schema.split(', ');

								var diff = false;

								if (new_columns.length != botoweb.env.cfg.db.cache_props.length + 1)
									diff = true;
								else {
									$.each(botoweb.env.cfg.db.cache_props, function (i, defn) {
										// Compare the column names and stop checking
										// if one does not match
										if ('prop_' + defn != new_columns[i + 1].replace(/ .*$/g, '')) {
											diff = true;
											return false;
										}
									});
								}

								if (diff) {
									console.warn('Local DB schema for meta_cache_props is outdated, data will be reset.');
									txn.executeSql('DROP TABLE meta_cache_props', null, setup_cache_props);
								}
							}
						);
					};

					setup_cache_props(txn);
				});
			}

			// Initialize the database schema
			$.each(botoweb.env.models, function(name, model) {

				// The columns here exclude query types, which are
				// backlinks found in other tables.
				db.transaction(function (txn) {
					// Fix duplicate column names in case the API designer made
					// a duplicate property.
					var set = {};

					var column_definitions = $.map(model.props, function (prop) {
						if (prop.meta.name in set || prop.meta.no_store)
							return;

						set[prop.meta.name] = 1;

						var defn = botoweb.ldb.prop_to_column_defn(prop);

						if (prop.is_type('reference') && !prop.is_type('list'))
							return [defn, botoweb.ldb.prop_to_column(prop) + '__type TEXT'];

						return defn;
					});

					column_definitions.unshift('id TEXT UNIQUE');

					txn.executeSql(
						'CREATE TABLE IF NOT EXISTS ' + botoweb.ldb.model_to_table(model) +
						' (' + column_definitions.join(', ') + ')'
					);

					// Check the table schema for changes. If anything has changed
					// we need to reset and re-sync the table.
					txn.executeSql(
						'SELECT sql FROM sqlite_master WHERE type = ? AND tbl_name = ?',
						['table', botoweb.ldb.model_to_table(model)],
						function (txn, results) {
							if (!results.rows.length)
								return;

							// Full CREATE TABLE... definition
							var schema = results.rows.item(0).sql;

							schema = schema.split('(')[1];
							var new_columns = schema.split(', ');

							var diff = false;

							if (new_columns.length != column_definitions.length)
								diff = true;
							else {
								$.each(column_definitions, function (i, defn) {
									// Compare the column names and stop checking
									// if one does not match
									if (defn.replace(/ .*$/, '') != new_columns[i].replace(/ .*$/, '')) {
										diff = true;
										return false;
									}
								});
							}

							if (diff) {
								console.warn('Local DB schema for ' + model.name + ' is outdated, data will be reset.');
								model.local = false;
								botoweb.ldb.sync.reset(model.name);
							}
						}
					);
				}, error);

				// The columns here include query types, but they will be
				// linked to a different table.
				var table = new botoweb.sql.Table(
					// These names refer to the actual DB schema
					botoweb.ldb.model_to_table(model),
					$.map(model.props, function (prop) {
						if (prop.meta.no_store)
							return;

						var name = botoweb.ldb.prop_to_column(prop);

						if (prop.is_type('reference') && !prop.is_type('list'))
							return [name, name + '__type'];

						return name;
					}),
					model,
					// These friendlier names will be used in the abstraction
					model.name,
					$.map(model.props, function (prop) {
						if (prop.meta.no_store)
							return;

						if (prop.is_type('reference') && !prop.is_type('list'))
							return [prop.meta.name, prop.meta.name + '__type'];

						return prop.meta.name;
					})
				);

				botoweb.ldb.tables[model.name] = table;

				$.each(this.props, function() {
					var prop = this;

					// lists are added in a separate table which links the list values.
					if (this.is_type('list')) {
						var table_name = botoweb.ldb.prop_to_table(this);

						var cols = ['val'];

						if (this.is_type('reference'))
							cols.push('val__type')

						db.transaction(function (txn) {
							txn.executeSql(
								'CREATE TABLE IF NOT EXISTS ' + table_name +
								' (id TEXT, ' + cols.join(' TEXT, ') + ' TEXT)'
							);
							txn.executeSql(
								'CREATE INDEX IF NOT EXISTS idx_' + table_name + '_id ON ' + table_name +
								' (id)'
							);
						}, error);

						var list_table = new botoweb.sql.Table(
							table_name,
							cols,
							model
						).set_parent(table);

						botoweb.ldb.tables[table_name] = list_table;

						table.c[this.meta.name + '_ref'] = list_table.c.id;
						table.c[this.meta.name + '_ref'].values = list_table.c.val;

						// The column for this property in the original table is actually a
						// reference to the new list_table.
						table.c[this.meta.name + '_ref'] = list_table.c.id;
					}
					// complexType mappings are added in a separate table which maps keys to values.
					else if (this.is_type('complexType')) {
						var table_name = botoweb.ldb.prop_to_table(this);

						db.transaction(function (txn) {
							txn.executeSql(
								'CREATE TABLE IF NOT EXISTS ' + table_name +
								' (id TEXT, key TEXT, val TEXT)'
							);
							txn.executeSql(
								'CREATE INDEX IF NOT EXISTS idx_id ON ' + table_name +
								' (id)'
							);
						}, error);

						var map_table = new botoweb.sql.Table(
							table_name,
							['key', 'val'],
							model
						).set_parent(table);

						botoweb.ldb.tables[table_name] = map_table;

						// The column for this property in the original table is actually a
						// reference to the new list_table.
						table.c[this.meta.name + '_ref'] = map_table.c.id;
						table.c[this.meta.name + '_ref'].keys = map_table.c.key;
						table.c[this.meta.name + '_ref'].values = map_table.c.val;
					}
				});
			});

			// "query" types are reverse references which must be linked to
			// the appropriate table and column once all tables are created.
			$.each(botoweb.env.models, function(name, model) {
				$.each(model.props, function() {
					if (this.is_type('query') && this.meta.item_type in botoweb.ldb.tables) {
						// Map the query column to the _ref_name column in
						// the table corresponding to _item_type.
						botoweb.ldb.tables[name].c[this.meta.name + '_ref'] = botoweb.ldb.tables[this.meta.item_type].c[this.meta.ref_name];
					}
				});
			});

			botoweb.ldb.sync.find_local_models(function () {
				ready(db);
			});
		}
	},

	/**
	 * Formats the model name into a proper non-conflicting table name
	 *
	 * @param {botoweb.Model} model The model which will be retrieved.
	 * @return The table name.
	 */
	model_to_table: function (model) {
		return 'model_' + model.name.replace(/\s+/g, '__');
	},

	/**
	 * Determines the table which will contain values for the property.
	 *
	 * @param {botoweb.Model} model The property's parent model.
	 * @param {botoweb.Property} prop The property which will be retrieved.
	 * @return The table name.
	 */
	prop_to_table: function (prop) {
		var base_table = botoweb.ldb.model_to_table(prop.meta.model);

		if (prop.is_type('list', 'complexType'))
			return base_table + '_list_' + botoweb.ldb.prop_to_column(prop);
		else if (prop.is_type('query'))
			return botoweb.ldb.model_to_table(botoweb.env.models[prop.meta.item_type]);

		return base_table;
	},

	/**
	 * Formats the property name into a proper non-conflicting column name.
	 *
	 * @param {botoweb.Property} prop The property which will be retrieved.
	 * @return The column name.
	 */
	prop_to_column: function (prop) {
		return 'prop_' + prop.meta.name.replace(/\s+/g, '__');
	},

	/**
	 * Creates a full column definition for the property, including name and
	 * data type.
	 *
	 * @param {botoweb.Property} prop The property which will be stored in
	 * the column.
	 * @return The full column definition string.
	 */
	prop_to_column_defn: function (prop) {
		// Cannot be stored
		if (prop.meta.no_store)
			return null;

		var col = botoweb.ldb.prop_to_column(prop);

		switch (prop.meta.type) {
			case 'integer':
			case 'boolean':
			// These two are represented by the # of entries in the map/list table
			case 'complexType':
			case 'list':
				col += ' INTEGER';
				return col;

			case 'float':
				col += ' REAL';
				return col;

			// Should not be represented in the local DB due to unknown size
			case 'blob':

			// Cannot be represented in a single column
			case 'query':
				return null;

			case 'string':
			case 'str':
			case 'text':
			case 'dateTime':
			case 'reference':
			default:
				col += ' TEXT';
				return col;
		}
	},

	/**
	 * Converts implicit = operator filters (maps) into Array format queries
	 * with explicit = operators.
	 *
	 * @param {Array|Object} The original filter specification.
	 * @return A filter query in explicit operator format.
	 */
	normalize_filters: function (filters) {
		if (!$.isArray(filters)) {
			var query = [];
			$.each(filters, function (k, v) {
				query.push([k, 'is', v]);
			});

			return query;
		}

		return filters;
	},

	/**
	 * Generates SQL expressions suitable for use in a botoweb.sql.Query
	 * on the given filters. Filters may be specified in explicit or
	 * implicit operator format.
	 *
	 * @param {Array|Object} The implicit or explicit operator filter defn.
	 * @return An SQL string which will perform the filtering.
	 */
	parse_filters: function (filters, table) {
		var exprs = [];

		filters = botoweb.ldb.normalize_filters(filters);

		// Generate an expression for the query. Multiple filter queries
		// implies AND logic.
		$.each(filters, function() {
			var col = table.c[this[0]];
			var op = this[1];
			var values = this[2];
			var expr = [];

			if (!$.isArray(values))
				values = [values];

			// Generate an expression for each value. Multiple values
			// implies OR logic
			$.each(values, function(i, val) {
				expr.push(col.cmp(val, sql_op));
			});

			// Multiple value expressions will be joined with OR logic.
			exprs.push(expr);
		});

		if (exprs.length == 0)
			return;

		// Return the resulting compound expression
		return exprs;
	},

	/**
	 * Selects a record from the database based on its model and id. The
	 * resulting object will have all values loaded except complexType,
	 * query, and list types.
	 *
	 * Options include:
	 * * filters - apply conditions to restrict whether the object is loaded
	 * * no_results - callback fnc when no results are found
	 * * success - callback fcn, receives results as first arg
	 *
	 * @param {botoweb.Model} model The type of object.
	 * @param {String} id The id of the object.
	 * @param {Object} opt Options.
	 */
	get: function (model, id, opt) {
		if (!opt) opt = {};

		botoweb.ldb.dbh.transaction(function (txn) {
			var table = botoweb.ldb.model_to_table(model);

			var query = new botoweb.sql.Query(table)
				.filter(table.c.id.cmp(id));

			if (opt.filters) {
				var conditions = botoweb.ldb.parse_filters(opt.filters, table);

				if (conditions) {
					$.each(conditions, function () { query.filter(this); });
				}
			}

			query.all(txn, function (txn, results) {
				return botoweb.ldb.process_results(txn, results, opt);
			});
		});
	},

	/**
	 * Selects a related record from the database based on an object and the
	 * property to follow. The resulting object will have all values loaded
	 * except complexType, query, and list types.
	 *
	 * Options include:
	 * * filters - apply conditions to restrict whether the object is loaded
	 * * no_results - callback fnc when no results are found
	 * * success - callback fcn, receives results as first arg
	 *
	 * @param {botoweb.Model} obj The object from which we follow the reference.
	 * @param {botoweb.Property} prop The property to follow.
	 * @param {Object} opt Options.
	 */
	follow: function (obj, prop, opt) {
		if (!opt) opt = {};

		if (prop._type == 'query') {
			// TODO follow reverse references
		}

		botoweb.ldb.dbh.transaction(function (txn) {
			var model = botoweb.env.models[obj.model];
			var table = botoweb.ldb.tables[botoweb.ldb.prop_to_table(model, prop)];

			var query = new botoweb.sql.Query(table)
				.filter(table.c.id.cmp(obj.properties[prop.name].id));

			if (opt.filters) {
				var conditions = botoweb.ldb.parse_filters(opt.filters, table);

				if (conditions) {
					$.each(conditions, function () { query.filter(this); });
				}
			}

			query.all(txn, function (txn, results) {
				return botoweb.ldb.process_results(txn, results, opt);
			});
		});
	},

	/**
	 * Converts DB results to botoweb objects.
	 * Not implemented yet.
	 *
	 * @param {[Object]} results An array of query results.
	 * @param {Object} opt The options passed to the result retrieval method.
	 */
	process_results: function(results, opt) {
		// If there are no results, call a no_results fnc if provided
		if (!results.length) {
			if (opt.no_results)
				opt.no_results();

			return;
		}

		$.each(results, function() {
			// TODO instantiate botoweb.Model from row
			opt.success(results);
		});
	},

	/**
	 * Finds any properties which may be cached, according to the cache_props
	 * environment config.
	 *
	 * @param {botoweb.Object} obj The object to cache
	 */
	cache_props: function (obj) {
		if (botoweb.env.cfg.db.cache_props.length == 0 || !botoweb.ldb.dbh)
			return obj;

		var columns = ['id'];
		var bind_params = [obj.id];

		$.each(botoweb.env.cfg.db.cache_props, function (i, p) {
			if (p in obj.data) {
				columns.push('prop_' + p);
				bind_params.push(obj.data[p].toString());
			}
		});

		botoweb.ldb.dbh.transaction(function (txn) {
			txn.executeSql( "INSERT OR REPLACE INTO meta_cache_props" +
				' (' + columns.join(', ') + ')' +
				' VALUES (' + $.map(bind_params, function() { return '?' }).join(', ') + ')',
				bind_params,
				null,
				function (t,e) { console.error(e.message)}
			);
		});

		return obj;
	},

	/**
	 * Finds any properties which may be cached, according to the cache_props
	 * environment config.
	 *
	 * @param {botoweb.Object} obj The object to cache
	 */
	get_cached_props: function (model, id, fnc) {
		if (botoweb.env.cfg.db.cache_props.length == 0 || !botoweb.ldb.dbh)
			return [];

		var props = {};

		$.each(botoweb.env.cfg.db.cache_props, function (i, p) {
			if (p in model.prop_map) {
				props[p] = [];
			}
		});

		botoweb.ldb.dbh.transaction(function (txn) {
			txn.executeSql( "SELECT * FROM meta_cache_props WHERE " +
				' id = ?',
				[id],
				function (txn, results) {
					// The object is not cached, so we have to query it
					if (results.rows.length == 0) {
						return model.get(id, function (obj) {
							if (obj)
								fnc(obj.data);
							else
								fnc();
						});
					}

					var data = results.rows.item(0);

					for (var i in props) {
						props[i] = new model.prop_map[i].instance([{val: data['prop_' + i] }]);
					}

					fnc(props);
				},
				function (t, e) {
					console.error(e.message);
				}
			);
		});
	}
};
