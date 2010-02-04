/**
 * JavaScript API to facilitate the construction of SQL queries for use with
 * SQLite via HTML5 Database Storage. Provides an abstraction between the
 * local database and botoweb which allows much more natural use of the data.
 *
 * @author Ian Paterson
 */
botoweb.sql = {
	/**
	 * @constructor
	 */
	Query: function () {
		this.columns = [];
		this.tables = [];
		this.where = [];

		this.filter = function (expr) {
			this.where.push(expr);
			return this;
		}

		this.append_column = function (column) {

		}
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
	Table: function (tbl_name, tbl_columns, name, columns) {
		this.name = name || tbl_name;
		this.tbl_name = tbl_name;
		this.c = {};
		this.parent = null;

		// Prevent array indexing errors if columns is undef
		if (!columns)
			columns = {};

		// Always need an id.
		this.c['id'] = new botoweb.sql.Column('id', this);

		for (var c in tbl_columns) {
			this.c[columns[c] || tbl_columns[c]] = new botoweb.sql.Column(tbl_columns[c], this);
		}

		this.equals = function (t) {
			return t.tbl_name == this.tbl_name;
		};

		this.set_parent = function (t) {
			this.parent = t;
			return this;
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
	Column: function (name, table) {
		this.name = name;
		this.table = table;
	}
};