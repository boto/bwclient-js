/**
 * Captures paging data and fires appropriate JS events. Also manages the
 * transition between pages.
 *
 * @author Ian Paterson
 */

botoweb.ui.page = new function() {
	this.history = [];

	/**
	 * Fetches the page from the cache if it is available, otherwise fetches
	 * from the server. This method does not add anything to the cache. Instead,
	 * the markup is cached to localStorage elsewhere once any embedded
	 * templates have been integrated.
	 *
	 * Triggers unload event on botoweb.ui.page which can be used by a global
	 * listener to provide some interface to indicate that a new page is
	 * loading. The existing page will remain visible until the new page has
	 * undergone all synchronous markup parsing.
	 *
	 * @param {Object|String} loc A URL string or a location object from
	 * botoweb.ui.page.location.
	 * @param {Function} fnc A callback function to run when the page is loaded.
	 */
	this.load = function (loc, fnc) {
		$(botoweb.ui.page).triggerHandler('unload');

		var html;

		if (typeof loc == 'string')
			html = retrieve(loc);
		else
			html = retrieve(loc.hash_href);

		if (html)
			fnc(html);
		else {
			var base = botoweb.env.cfg.static_host || loc.base_href;

			$.get(botoweb.util.url_join(base, loc.hash_href), function (html) {
				init_page(loc.hash_href, html, fnc);
			});
		}
	};

	/**
	 * Returns an object similar to document.location which is defined by the
	 * botoweb ajax page URL schema.
	 *
	 * @return An object with keys href, hash, hash_href and query
	 */
	this.location = function () {
		var url = '' + document.location.href;

		return {
			href: url.replace(/#.*/, ''),
			hash: url.replace(/.*#/, ''),
			hash_href: url.replace(/.*#|\?.*/g, ''),
			query: url.replace(/.*\?/, ''),
			base_href: url.replace(/([^\/])\/[^\/].*/, '$1')
		};
	};

	/**
	 * Tears down the current page and stops all active ajax requests. Unbinds
	 * all botoweb.ui.page listeners except those namespaced as global.
	 *
	 * @private
	 */
	function destroy (old_url) {
		botoweb.ajax.stop_all();

		$('#botoweb_content').empty();

		// Some low-level stuff here... the bound events are stored in a data
		// store called events.
		$.each($(botoweb.ui.page).data('events'), function (i, event) {
			// event is an object over which we can iterate to get the actual
			// handlers functions.
			$.each(event, function (i, handler) {
				// The type attribute on a handler function is its namespace
				// i.e. $('a').bind('click.global', ...) -> type == 'global'
				if (this.type != 'global')
					delete event[i];
			});
		});
	};

	/**
	 * Stores page content to the cache.
	 *
	 * @param {String} url The URL of the page (in any consistent format)
	 * @param {String} data The content of the page.
	 * @private
	 */
	function store (url, data) {
		localStorage.setItem('page_' + url.replace(/\W/g, '_'), data);
	}

	/**
	 * Retrieves page content from the cache.
	 *
	 * @param {String} url The URL of the page (in any consistent format)
	 * @return The HTML for the page or undefined if it is not cached.
	 * @private
	 */
	function retrieve (url) {
		return localStorage['page_' + url.replace(/\W/g, '_')];
	}

	/**
	 * Passes raw HTML through an initial round of markup. Since this process
	 * may become asynchronous if the markup requires templates to be loaded,
	 * a callback is used to pass the page along to the next step, show_page.
	 *
	 * This should not be called on any pages retrieved from cache.
	 *
	 * @param {String} html The HTML markup string.
	 */
	function init_page (url, html, fnc) {
		botoweb.ui.markup.page_store(html, function (html) {
			store(url, html);
			fnc(html);
		});
	}

	/**
	 * Passes off HTML which is read for high-level markup parsing to the next
	 * stage in markup parsing. Once the parsing is complete the existing page
	 * will be destroyed and the new page will be displayed. Any asynchronous
	 * parsing or data retrieval will be filled in after the page is displayed.
	 *
	 * Triggers the load event on botoweb.ui.page which can be used to reverse
	 * any interface changes made while the page was loading.
	 *
	 * @param {String} html The HTML markup string.
	 */
	function show_page (html) {
		botoweb.ui.markup.page_show(html, function (node) {
			destroy();
			$(botoweb.ui.page).triggerHandler('load');
			$('#botoweb_content').append(node);
		});
	}

	/**
	 * Checks the URL for changes. All changes will trigger the change event on
	 * botoweb.ui.page, and any change to the hash_href (the markup page URL)
	 * will cause the current page to be destroyed and the new page loaded.
	 *
	 * @private
	 */
	function check () {
		var self = botoweb.ui.page;
		var loc = self.location();

		if (!self.history.length || loc.hash != self.history[0].hash) {
			var new_page = false;

			// If the base page has changed, load it, otherwise rely on page
			// change listeners. This allows pages to maintain state when the
			// URL changes, otherwise the page will just be reloaded by the
			// default listener.
			if (!self.history.length || loc.hash_href != self.history[0].hash_href) {
				self.load(loc, show_page);
				new_page = true;
			}

			// If a new page was loaded there probably will not be anything
			// bound to the change event, but we trigger it anyway to support a
			// generic action which occurs every time the page changes.
			$(botoweb.ui.page).triggerHandler('change', [loc, new_page]);

			self.history.unshift(loc);

			if (self.history.length > 10)
				self.history.pop();
		}
	}

	setInterval(check, 250);
}();