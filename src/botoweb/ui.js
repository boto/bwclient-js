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

			botoweb.env.models.Contact.all();
			botoweb.env.models.User.all();
		});

		var loc = botoweb.ui.page.location();

		if (!loc.hash_href)
			document.location.href += '#' + botoweb.env.cfg.templates.home;
	}
};