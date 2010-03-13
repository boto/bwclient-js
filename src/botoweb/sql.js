/**
 * JavaScript API to facilitate the construction of SQL queries for use with
 * SQLite via HTML5 Database Storage. Provides an abstraction between the
 * local database and botoweb which allows much more natural use of the data.
 *
 * @author Ian Paterson
 */
botoweb.sql = {
	/**
	 * Builds a SQL query by connecting various components. Tables are joined
	 * implicitly as needed when they are used in filters or columns. The query
	 * can be converted to SQL at any time simply by using it as a string. Most
	 * methods modify the Query in place and also return it to allow chaining.
	 *
	 * @param {[botoweb.sql.Table|botoweb.sql.Column]} arguments May be a single
	 * column or table or multiple.
	 * @constructor
	 */
	Query: function () {
		var self = this;

		/**
		 * A mixed array of columns and/or tables.
		 * @type {[botoweb.sql.Table|botoweb.sql.Column]}
		 */
		this.columns = [];
		/**
		 * An array of tables that are explicitly or implicitly required in the
		 * query.
		 * @type {[botoweb.sql.Table]}
		 */
		this.tables = [];
		/**
		 * An array of expressions.
		 * @type {[botoweb.sql.Expression]}
		 */
		this.filters = [];
		/**
		 * An array of group by clauses (order is preserved).
		 * @type {[[botoweb.sql.Expression, 'ASC'|'DESC']]}
		 */
		this.groups = [];
		/**
		 * An array of order by clauses (order is preserved).
		 * @type {[[botoweb.sql.Expression, 'ASC'|'DESC']]}
		 */
		this.order = [];
		/**
		 * An array of bound parameters which will be inserted by the query
		 * engine.
		 * @type {[String]}
		 */
		this.bind_params = [];
		/**
		 * If true, selecting a table will automatically join into each related
		 * table for lists and mappings.
		 * @type {Boolean}
		 */
		this.follow_refs = false;
		/**
		 * The starting index for retrieving query results.
		 */
		this.start = 0;
		/**
		 * The maximum number of entries to retrieve.
		 */
		this.max_results = null;

		/**
		 * Adds a new filtering expression which will go to the WHERE clause.
		 *
		 * @param {botoweb.sql.Expression} expr The filter condition.
		 * @return The Query for chaining.
		 */
		this.filter = function (expr) {
			if (!expr)
				return this;

			this.filters.push(expr);

			$.each(expr.tables, function(i, t) {
				add_table(t);
			});

			$.each(expr.bind_params, function() { self.bind_params.push(this) });

			return this;
		};

		/**
		 * Convenience function to apply botoweb filters related to the given
		 * table to the Query.
		 *
		 * @param {Object|Array} filters Botoweb filters specified in either
		 * implicit = or explicit operator format.
		 * @param {botoweb.sql.Table} tbl The table containing the properties
		 * referenced in the filters.
		 * @return The Query for chaining.
		 */
		this.apply_bw_filters = function (filters, tbl) {
			var query = this;

			// Convert implicit = (hash map) filters to explicit format
			filters = botoweb.ldb.normalize_filters(filters);

			// Convert each filter into a column comparison expression
			$.each(filters, function() {
				if (this[0] in tbl.c)
					query.filter(tbl.c[this[0]].cmp(this[2], this[1]));
			});

			return query;
		};

		/**
		 * Adds a new column or entire table to the SELECT clause. The column's
		 * parent table will be automatically joined into the query. Tables
		 * added here will later be broken into their columns (some columns will
		 * be exluded unless the query follows references).
		 *
		 * @param {botoweb.sql.Column|botoweb.sql.Table} column The column or
		 * entire table to add to the SELECT clause.
		 * @return The Query for chaining.
		 */
		this.append_column = function (column) {
			this.columns.push(column);

			return this;
		};

		/**
		 * Adds a table to the list of tables that should be joined, unless it
		 * is already in the list.
		 * @param {botoweb.sql.Table} tbl The table to add.
		 * @private
		 */
		function add_table (tbl) {
			if ($.inArray(tbl, self.tables) == -1)
				self.tables.push(tbl);
		};

		/**
		 * Adds a new column or entire table to the SELECT clause. The column's
		 * parent table will be automatically joined into the query. Tables
		 * added here will later be broken into their columns (some columns will
		 * be exluded unless the query follows references).
		 *
		 * @param {botoweb.sql.Column|botoweb.sql.Table} column The column or
		 * entire table to add to the SELECT clause.
		 * @return The Query for chaining.
		 */
		this.limit = function (lim, start) {
			this.max_results = lim;
			this.start = start || 0;

			return this;
		};

		/**
		 * Adds an expression to the GROUP BY clause.
		 *
		 * @param {botoweb.sql.Expression} expr A valid GROUP BY expression.
		 * @param {'ASC'|'DESC'} asc_desc The sort order.
		 * @return The Query for chaining.
		 */
		this.group_by = function (expr, asc_desc) {
			this.groups.push([expr, asc_desc]);

			return this;
		};

		/**
		 * Adds an expression to the ORDER BY clause.
		 *
		 * @param {botoweb.sql.Expression} expr A valid ORDER BY expression.
		 * @param {'ASC'|'DESC'} asc_desc The sort order.
		 * @return The Query for chaining.
		 */
		this.order_by = function (expr, asc_desc) {
			this.order.push([expr, asc_desc]);

			return this;
		};

		/**
		 * Executes the query and selects all matching results.
		 *
		 * @param {Transaction} txn A database transaction.
		 * @param {Function} fnc Called when the results are retrieved, gets
		 * (transaction, results) as arguments.
		 */
		this.all = function (txn, fnc) {
			txn.executeSql(this, this.bind_params, this.simplify_results(fnc), function (txn, e) {
				botoweb.util.error(e);
			});
		};

		/**
		 * Executes the query and selects all matching results.
		 *
		 * @param {Transaction} txn A database transaction.
		 * @param {Function} fnc Called when the results are retrieved, gets
		 * (transaction, results) as arguments.
		 */
		this.page = function (txn, fnc, page) {
			if (!page)
				page = 0;

			this.limit(100, 100 * page);

			txn.executeSql(this, this.bind_params, this.simplify_results(fnc, page), function (txn, e) {
				botoweb.util.error(e);
			});
		};

		/**
		 * Counts the results of the query.
		 *
		 * @param {Transaction} txn A database transaction.
		 * @param {Function} fnc Called when the count retrieved, gets (count)
		 * argument.
		 */
		this.count = function (txn, fnc) {
			var tbl = this.columns[0];

			if (tbl instanceof botoweb.sql.Column)
				tbl = tbl.table;

			count_query = new botoweb.sql.Query(botoweb.sql.func('count', tbl.c.id));

			$.each(this.filters, function () {
				count_query.filter(this);
			});

			count_query.all(txn, function(results) {
				for (i in results[0])
					return fnc(results[0][i]);
			});
		};

		/**
		 * Returns function which will trigger the callback with a simple native
		 * array representing the results as the first argument. Actual
		 * SQLResultSet object is passed as second param in case it is needed.
		 */
		this.simplify_results = function (fnc, page) {
			var tbl = this.columns[0];
			var query = this;

			return function(txn, results) {
				if (results.rows.length == 0) {
					return fnc([], results, txn);
				}

				var rows = [];

				// TODO support querying more than one object
				// If the Query is fetching all rows in a particular table, and
				// that table is assigned to a Model, generate an Object for it.
				var make_obj = tbl instanceof botoweb.sql.Table
					&& !tbl.parent
					&& tbl.model;

				for (var i = 0; i < results.rows.length; i++) {
					var row = results.rows.item(i);

					// Construct an Object for the row.
					if (make_obj) {
						if (row.id in tbl.model.objs) {
							row[0] = tbl.model.objs[row.id];
						}
						else {
							var data = {};

							$.each(tbl.model.props, function (i, prop) {
								var col = botoweb.ldb.prop_to_column(prop);

								if (col in row) {
									var prop_data;

									if (prop.is_type('reference'))
										prop_data = { count: 1, id: (row[col] || null), type: row[col + '__type'], val: undefined };
									else if (prop.is_type('list', 'complexType'))
										prop_data = { count: (row[col] || null), val: undefined };
									else
										prop_data = { val: (row[col] || null) };

									data[prop.meta.name] = new prop.instance(prop_data);
								}
							});

							row[0] = new botoweb.Object(
								row.id,
								tbl.model.name,
								data
							);
						}
					}

					rows.push(row);
				}

				if (typeof page != 'undefined') {
					function next_page() {
						botoweb.ldb.dbh.transaction(function (txn) {
							query.page(txn, fnc, page + 1);
						});
					}

					if (fnc(rows, page, results, txn, next_page))
						next_page()
				}
				else
					fnc(rows, results, txn);
			};
		};

		/**
		 * Calling this causes the query to follow all reference columns within
		 * selected tables.
		 *
		 * @return The Query for chaining.
		 */
		this.follow_references = function () {
			this.follow_refs = true;

			return this;
		};

		/**
		 * Generates the final SQL query.
		 */
		this.toString = function() {
			var columns = [];

			// Some columns are actually tables, so we need to extract their
			// columns to another array.
			$.each(this.columns, function (i, column) {
				if (column instanceof botoweb.sql.Table) {
					var tbl = column; // less confusing
					add_table(tbl);

					columns.push(tbl.c.id);

					$.each(tbl.c, function (prop_name, c) {
						if (!c || !(prop_name in tbl.model.prop_map))
							return;

						if (prop_name != 'id' && tbl.model.prop_map[prop_name].is_type('query','blob')) {
							if (!self.follow_refs)
								return;

							// c refers to the column in the other table, so we
							// join the tables by linking the id to this column
							add_table(c.table);
							self.filter(tbl.c.id.cmp(c));
						}

						columns.push(c);

						if ((prop_name + '__type') in tbl.c)
							columns.push(tbl.c[prop_name + '__type']);
					});
				}
				else {
					columns.push(column);

					if (column.table && (column.name + '__type') in column.table.c)
						columns.push(column.table.c[column.name + '__type']);

					if (column.tables) {
						$.each(column.tables, function () { add_table(this); });
					}
					else
						add_table(column.table);
				}
			});

			var sql = 'SELECT ' + columns.join(', ');

			if (this.tables.length)
				sql += '\nFROM ' + this.tables.join(', ');

			if (this.filters.length)
				sql += '\nWHERE ' + this.filters.join(' AND ');

			if (this.groups.length)
				sql += '\nGROUP BY ' + $.map(this.groups, function(g) { return g.join(' '); }).join(', ');

			if (this.order.length)
				sql += '\nORDER BY ' + $.map(this.order, function(o) { return o.join(' '); }).join(', ');

			if (this.max_results)
				sql += '\nLIMIT ' + this.start + ', ' + this.max_results;

			return sql;
		};

		// Initialize columns passed to the constructor
		$.each(arguments, function (i, col) {
			if (col)
				self.append_column(col);
		});
	},

	/**
	 * Creates an abstraction of DB tables, which are modified to prevent
	 * conflicts with SQL keywords and are otherwise structurally unsuitable for
	 * easy use via JS. Columns in one table may be mapped internally to a
	 * different table, allowing queries to be built more naturally.
	 *
	 * @param {String} tbl_name The name of the DB table.
	 * @param {[String]} tbl_columns The names of the DB columns.
	 * @param {String} name The internal JS name for the table.
	 * @param {[String]} columns The internal JS names for the columns.
	 * @constructor
	 */
	Table: function (tbl_name, tbl_columns, model, name, columns) {
		this.name = name || tbl_name;
		this.tbl_name = tbl_name;
		this.c = {};
		this.parent = null;
		this.model = model;

		// Prevent array indexing errors if columns is undef
		if (!columns)
			columns = {};

		// Always need an id.
		this.c['id'] = new botoweb.sql.Column('id', this);

		for (var c in tbl_columns) {
			this.c[columns[c] || tbl_columns[c]] = new botoweb.sql.Column(tbl_columns[c], this, c);
		}

		this.set_parent = function (tbl) {
			this.parent = tbl;
			return this;
		};

		/**
		 * Drops the table, use with caution.
		 *
		 * @param {Transaction} txn A database transaction handle.
		 */
		this.__drop = function(txn) {
			txn.executeSql(
				'DROP TABLE ' + this
			);
		};

		/**
		 * Empties the table, use with caution.
		 *
		 * @param {Transaction} txn A database transaction handle.
		 */
		this.__empty = function(txn) {
			txn.executeSql(
				'TRUNCATE TABLE ' + this
			);
		};

		/**
		 * @return The DB table name.
		 */
		this.toString = function () {
			return this.tbl_name;
		};
	},

	/**
	 * Represents a column in a table. A single column may be referenced by
	 * multiple botoweb.sql.Table objects, but it must map to only one table
	 * where the column is actually found in the DB.
	 *
	 * @param {String} name The name of the column in the DB.
	 * @param {botoweb.sql.Table} table The table containing the column.
	 * @constructor
	 */
	Column: function (name, table, prop_name) {
		this.col_name = name;
		this.table = table;
		this.name = prop_name;

		/**
		 * Compares the column to another column, expression, or literal.
		 * Special operators starts-with, ends-with, and contains modify the
		 * value to include wildcards (and can therefore only be used with
		 * string values). The default opertator is 'is' which is similar to =.
		 *
		 * @param {botweb.sql.Column|String} val The value we're comparing to.
		 * @param {String} op The operator (any SQL op plus starts-with,
		 * ends-with, and contains).
		 * @return A botoweb.sql.Expression capturing the comparison.
		 */
		this.cmp = function(val, op) {
			op = op || '=';

			var sql_op = 'like';

			switch (op) {
				case 'contains':
					val = '%' + val + '%';
					break;
				case 'starts-with':
					val = val + '%';
					break;
				case 'ends-with':
					val = '%' + val;
					break;

				case 'is':
				case 'is not':
					sql_op = {is: '=', 'is not': '!='}[op];
					break;

				case 'like':
					break;

				default:
					if (/\w/.test(op))
						return null;

					sql_op = op;
			}

			return new botoweb.sql.Expression([this, val], function() {
				return this.columns.join(' ' + sql_op + ' ');
			});
		}

		/**
		 * @return a non-conflicting table.column name.
		 */
		this.toString = function() {
			return this.table + '.' + this.col_name;
		}
	},

	/**
	 * A generic representation of a collection of columns, literals, and other
	 * expressions which keeps track of any tables that it requires as well as
	 * any literal parameters which are bound.
	 *
	 * @param {[botoweb.sql.Column|botoweb.sql.Expression|String]} columns An
	 * array of columns, expressions, or literals which are used in the
	 * expression. How they are used depends on what the Expression was created
	 * to do.
	 * @param {Function} str_func Determines how the expression data will be
	 * converted to SQL. Called in the context of the botoweb.sql.Expression.
	 * @constructor
	 */
	Expression: function (columns, str_fnc) {
		var self = this;
		this.columns = [];
		this.tables = [];
		this.bind_params = [];

		function add_table (tbl) {
			if ($.inArray(tbl, self.tables) == -1)
				self.tables.push(tbl);
		};

		$.each(columns, function(i, c) {
			if (c instanceof botoweb.sql.Expression) {
				self.columns.push(c);
				$.each(c.tables, function() { add_table(this); });
				$.each(c.bind_params, function() { self.bind_params.push(this); });
			}
			else if (c instanceof botoweb.sql.Column) {
				self.columns.push(c);
				add_table(c.table);
			}
			// Literal
			else {
				self.columns.push('?');
				self.bind_params.push(c);
			}
		});

		/**
		 * Represents the expression as a string in whatever way it is directed
		 * to do so by its maker.
		 */
		this.toString = function() {
			return str_fnc.call(this);
		};
	},

	/**
	 * Combines any number of expressions with OR logic.
	 *
	 * @return A composite botoweb.sql.Expression.
	 */
	or: function () {
		return new botoweb.sql.Expression(arguments, function () {
			return '(' + this.columns.join(' OR ') + ')';
		});
	},

	/**
	 * Combines any number of expressions with AND logic.
	 *
	 * @return A composite botoweb.sql.Expression.
	 */
	and: function () {
		return new botoweb.sql.Expression(arguments, function () {
			return '(' + this.columns.join(' AND ') + ')';
		});
	},

	/**
	 * Creates an expression for any function. First argument is the name of the
	 * function, any other arguments will be passed to the SQL function.
	 *
	 * @param {String} func_str The name of the SQL function.
	 * @return A botoweb.sql.Expression representing the function.
	 */
	func: function(func_str) {
		var args = $.makeArray(arguments);
		args = args.splice(1);
		return new botoweb.sql.Expression(args, function() {
			return func_str + '(' + this.columns.join(',') + ')';
		});
	}
};
