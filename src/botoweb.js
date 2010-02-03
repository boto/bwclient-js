/**
 * JavaScript API for use with botoweb with integrated local storage for
 * enhanced data access and querying performance.
 *
 * @author Ian Paterson
 */
var botoweb = {
	ldb: {
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
		 * Opens a connection to the local database and initializes the database
		 * schema based on the botoweb API.
		 */
		prepare: function (ready, error) {
			var db = openDatabase(
				botoweb.ldb.name,
				botoweb.ldb.version,
				botoweb.ldb.title,
				Math.round(botoweb.ldb.size_mb * 1024 * 1024)
			);

			if (db) {
				// Initialize the database schema
				db.transaction(function (t) {
					$.each(botoweb.env.models, function(name, model) {
						t.executeSql(
							'CREATE TABLE ' + botoweb.ldb.model_to_table(model) +
							' (id TEXT UNIQUE, ' + $.map(model.properties, botoweb.ldb.prop_to_column_defn).join(', ') + ')'
						);

						$.each(this.properties, function() {
							// lists are added in a separate table which links the list values.
							if (this._type == 'list') {
								t.executeSql(
									'CREATE TABLE ' + botoweb.ldb.model_to_table(model) + '_ref_' + botoweb.ldb.prop_to_column(this) +
									' (id TEXT, ' + botoweb.ldb.prop_to_column_defn({name: this.name, _type: this._item_type}) + ')'
								);
							}
							// complexType mappings are added in a separate table which maps keys to values.
							else if (this._type == 'complexType') {
								t.executeSql(
									'CREATE TABLE ' + botoweb.ldb.model_to_table(model) + '_map_' + botoweb.ldb.prop_to_column(this) +
									' (id TEXT, key TEXT, val TEXT)'
								);
							}
						});
					});

					ready(db);
				}, error);
			}
		},

		/**
		 * Formats the model name into a proper non-conflicting table name
		 *
		 * @param {botoweb.ModelMeta} model The model which will be stored in
		 * the table.
		 * @return The table name.
		 */
		model_to_table: function (model) {
			return 'model_' + model.name.toLowerCase().replace(/\s+/g, '_');
		},

		/**
		 * Formats the property name into a proper non-conflicting column name.
		 *
		 * @param {botoweb.Property} prop The property which will be stored in
		 * the column.
		 * @return The column name.
		 */
		prop_to_column: function (prop) {
			return 'prop_' + prop.name.toLowerCase().replace(/\s+/g, '_');
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

				case 'blob':
				case 'mapping':
					col += ' BLOB';
					return col;

				// Cannot be represented in a column
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
		}
	},

	env: {},

	init: function (opt) {
		// TODO re-integrate actual API loading code.
		botoweb.env = {
			version: '0.1',

			models: {}
		};

		botoweb.ldb.name = opt.db.name;
		botoweb.ldb.title = opt.db.title;
		botoweb.ldb.size_mb = opt.db.size_mb;
		botoweb.ldb.version = botoweb.env.version;

		botoweb.ldb.prepare(function (db) {
			alert('ready ' + db);
		}, function (e) {
			alert('error ' + e.message);
		});
	}
};