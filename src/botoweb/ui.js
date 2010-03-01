/**
 * Provides an interface and support of special HTML markup for botoweb.
 *
 * @author Ian Paterson
 */

botoweb.ui = {
	/**
	 * Initializes the interface.
	 *
	 * NOTE: currently this is used for testing the local DB sync.
	 */
	init: function() {
		$(botoweb.ldb.sync).bind('end.init', function () {
			botoweb.util.log('Synchronizing complete');
			botoweb.ui.page.init();
			$(botoweb.ldb.sync).unbind('end.init');
		});

		$(botoweb.ldb.sync).bind('begin', function (e, data) {
			botoweb.util.log('starting update of ' + data.model.name + ', ' + data.num_updates + ' records to update');
		});

		$(botoweb.ldb.sync).bind('change', function (e, data) {
			$('#loaded').html('percent done: ' + data.percent_complete + '%');
		});

		$(botoweb.ldb.sync).bind('end', function (e, data) {
			botoweb.util.log('update is done');
		});


		var loc = botoweb.ui.page.location();

		if (!loc.hash_href)
			document.location.href += '#' + botoweb.env.cfg.templates.home;
	}
};