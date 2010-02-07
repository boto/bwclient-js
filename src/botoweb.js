/**
 * JavaScript API for use with botoweb with integrated local storage for
 * enhanced data access and querying performance.
 *
 * @author Chris Moyer
 * @author Ian Paterson
 */
var botoweb = {
	env: {},

	init: function (opt) {
		if (!opt) opt = {};

		// TODO re-integrate actual API loading code.
		botoweb.env = {
			version: '0.1',

			models: {Names:{name:'Names',properties:[{name:'name', _type: 'string'}]}}
		};

		botoweb.ldb.name = opt.db.name;
		botoweb.ldb.title = opt.db.title;
		botoweb.ldb.size_mb = opt.db.size_mb;
		botoweb.ldb.version = botoweb.env.version;

		botoweb.ldb.prepare(function (db) {
			var table = botoweb.ldb.tables.Names;
			var query = new botoweb.sql.Query(table)
				.filter(botoweb.sql.or(table.c.name.cmp('John'), table.c.name.cmp('J', 'starts-with')))

			alert('SQL:\n' + query + '\n\nBound parameters:\n' + query.bind_params);
		}, function (e) {
			alert('error ' + e.message);
		});
	}
};