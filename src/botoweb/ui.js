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
		botoweb.ui.page.init();

		var loc = botoweb.ui.page.location();

		if (!loc.hash_href)
			document.location.href += '#' + botoweb.env.cfg.templates.home;
	}
};