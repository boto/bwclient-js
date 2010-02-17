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
			botoweb.ldb.dbh = db = openDatabase(
				botoweb.ldb.name,
				botoweb.ldb.version,
				botoweb.ldb.title,
				Math.round(botoweb.ldb.size_mb * 1024 * 1024)
			);
		}

		// If the database does not open, try up to 10 times
		if (!db) {
			if (!attempts)
				attempts = 0;

			if (attempts > 10) {
				error({message: 'The browser refuses to create or load the local database.'});
				return;
			}

			setTimeout(function() {
				botoweb.ldb.prepare(ready, error, attempts + 1);
			}, 250);
			return;
		}

		if (botoweb.ldb.dbh) {
			// Initialize the database schema
			$.each(botoweb.env.models, function(name, model) {
				// The columns here exclude query types, which are
				// backlinks found in other tables.
				db.transaction(function (t) {
					t.executeSql(
						'CREATE TABLE IF NOT EXISTS ' + botoweb.ldb.model_to_table(model) +
						' (id TEXT UNIQUE, ' + $.map(model.properties, botoweb.ldb.prop_to_column_defn).join(', ') + ')'
					);
				}, error);

				// The columns here include query types, but they will be
				// linked to a different table.
				var table = new botoweb.sql.Table(
					// These names refer to the actual DB schema
					botoweb.ldb.model_to_table(model),
					$.map(model.properties, botoweb.ldb.prop_to_column),
					// These friendlier names will be used in the abstraction
					model.name,
					$.map(model.properties, function (prop) { return prop.name; })
				);

				botoweb.ldb.tables[model.name] = table;

				$.each(this.properties, function() {
					// lists are added in a separate table which links the list values.
					if (this._type == 'list') {
						var table_name = botoweb.ldb.prop_to_table(model, this);

						db.transaction(function (txn) {
							txn.executeSql(
								'CREATE TABLE IF NOT EXISTS ' + table_name +
								' (id TEXT, ' + botoweb.ldb.prop_to_column_defn({name: 'val', _type: this._item_type}) + ')'
							);
						}, error);

						var list_table = new botoweb.sql.Table(
							table_name,
							['val']
						).set_parent(table);

						botoweb.ldb.tables[table_name] = list_table;
						table.c[this.name].values = list_table.c.val;

						// The column for this property in the original table is actually a
						// reference to the new list_table.
						table.c[this.name] = list_table.c.id;
					}
					// complexType mappings are added in a separate table which maps keys to values.
					else if (this._type == 'complexType') {
						var table_name = botoweb.ldb.prop_to_table(model, this);

						db.transaction(function (txn) {
							txn.executeSql(
								'CREATE TABLE IF NOT EXISTS ' + table_name +
								' (id TEXT, key TEXT, val TEXT)'
							);
						}, error);

						var map_table = new botoweb.sql.Table(
							table_name,
							['key', 'val']
						).set_parent(table);

						botoweb.ldb.tables[table_name] = map_table;

						// The column for this property in the original table is actually a
						// reference to the new list_table.
						table.c[this.name] = map_table.c.id;
						table.c[this.name].keys = map_table.c.key;
						table.c[this.name].values = map_table.c.val;
					}
				});
			});

			// "query" types are reverse references which must be linked to
			// the appropriate table and column once all tables are created.
			$.each(botoweb.env.models, function(name, model) {
				$.each(model.properties, function() {
					if (this._type == 'query' && this._item_type in botoweb.ldb.tables) {
						// Map the query column to the _ref_name column in
						// the table corresponding to _item_type.
						botoweb.ldb.tables[name].c[this.name] = botoweb.ldb.tables[this._item_type].c[this._ref_name];
					}
				});
			});

			ready(db);
		}
	},

	/**
	 * Formats the model name into a proper non-conflicting table name
	 *
	 * @param {botoweb.ModelMeta} model The model which will be retrieved.
	 * @return The table name.
	 */
	model_to_table: function (model) {
		return 'model_' + model.name.replace(/\s+/g, '__');
	},

	/**
	 * Determines the table which will contain values for the property.
	 *
	 * @param {botoweb.ModelMeta} model The property's parent model.
	 * @param {botoweb.Property} prop The property which will be retrieved.
	 * @return The table name.
	 */
	prop_to_table: function (model, prop) {
		var base_table = botoweb.ldb.model_to_table(model);

		switch (prop._type) {
			case 'list':
				return base_table + '_list_' + botoweb.ldb.prop_to_column(prop);
			case 'complexType':
				return base_table + '_map_' + botoweb.ldb.prop_to_column(prop);
			case 'query':
				return botoweb.ldb.model_to_table(botoweb.env.models[prop._item_type]);
			default:
				return base_table;
		}

	},

	/**
	 * Formats the property name into a proper non-conflicting column name.
	 *
	 * @param {botoweb.Property} prop The property which will be retrieved.
	 * @return The column name.
	 */
	prop_to_column: function (prop) {
		return 'prop_' + prop.name.replace(/\s+/g, '__');
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
		var col = botoweb.ldb.prop_to_column(prop);

		switch (prop._type) {
			case 'integer':
			case 'boolean':
				col += ' INTEGER';
				return col;

			case 'float':
				col += ' REAL';
				return col;

			// Should not be represented in the local DB due to unknown size
			case 'blob':

			// Cannot be represented in a single column
			case 'complexType':
			case 'query':
			case 'list':
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
	 * @param {botoweb.ModelMeta} model The type of the object.
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
	}
};