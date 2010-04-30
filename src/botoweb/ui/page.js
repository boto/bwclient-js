/**
 * Captures paging data and fires appropriate JS events. Also manages the
 * transition between pages.
 *
 * @author Ian Paterson
 */

botoweb.ui.page = new function() {
	this.history = [];
	this.cache = {};
	this.handler_cache = {};
	this.preserve_cache = false;
	this.obj = null;

	var self = this;

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
	this.load = function (loc, fnc, opt) {
		opt = opt || {};
		var html;

		// Load the page from cache, unless it is a refresh
		if (!opt.refresh && loc.full in this.cache) {
			detach_events();
			destroy(opt);

			$('#botoweb.page').append(this.cache[loc.full]);

			if (loc.full in this.handler_cache) {
				$.each(this.handler_cache[loc.full], function () {
					$(self).bind(this.type, this.handler);
				});
			}

			$('#botoweb.page').children().first().triggerHandler('reload')

			$(self).triggerHandler('load');

			return;
		}


		if (typeof loc == 'string') {
			html = retrieve(loc);

			// Make a copy of the location object to avoid modifying the central
			// location object.
			loc = $.extend({}, this.location, { hash_href: loc });
		}
		else
			html = retrieve(loc.hash_href);

		if (!fnc)
			fnc = show_page;

		if (html)
			fnc(html, opt);
		else {
			var base = botoweb.env.cfg.static_host || loc.base_href;

			$.get(botoweb.util.url_join(base, loc.hash_href), function (html) {
				init_page(loc.hash_href, html, fnc, opt);
			});
		}
	};

	/**
	 * Returns an object similar to document.location which is defined by the
	 * botoweb ajax page URL schema.
	 *
	 * @return An object with keys href, hash, hash_href and query
	 */
	this.get_location = function () {
		var url = '' + document.location.href;

		var loc = {
			href: url.replace(/#.*/, ''),
			base_href: url.replace(/([^\/])\/[^\/].*/, '$1'),
			full: url,
			hash: '',
			hash_href: '',
			query: '',
			data: {}
		};

		if (url.indexOf('#') >= 0) {
			loc.hash = url.replace(/.*#/, '');
			loc.hash_href = loc.hash.replace(/\?.*/g, '');
			loc.query = '';
			loc.data = {};

			if (loc.hash.indexOf('?') >= 0)
				loc.query = loc.hash.replace(/.*\?/, '');

			if (loc.query) {
				var query = loc.query.split(/[&=]/);

				for (var i = 0; i < query.length; i += 2)
					loc.data[query[i]] = unescape(query[i + 1]);
			}
		}

		return loc;
	};

	/**
	 * Starts the page change interval check, should be called once environment
	 * is set up.
	 */
	this.init = function () {
		check();

		setInterval(function () {
			check()
		}, 250);
		this.init = function() {};
	};

	/**
	 * Removes all cached pages from localStorage and refreshes the browser.
	 */
	this.reset = function () {
		for (var key in localStorage) {
			if (key.indexOf('page_') == 0)
				localStorage.setItem(key, '');
		}

		document.location.reload();
	};

	/**
	 * Clears any cached data for the given page based on its location.full.
	 */
	this.uncache = function (url) {
		delete this.cache[url];
		delete this.handler_cache[url];
	};

	/**
	 * Tears down the current page and stops all active ajax requests. Unbinds
	 * all botoweb.ui.page listeners except those namespaced as global.
	 *
	 * @private
	 */
	function destroy (opt) {
		opt = opt || {};

		if (opt.changed && self.history.length > 1 && !self.history[1].data.action) {
			self.cache[self.history[1].full] = $('#botoweb.page').children().detach();
		}
		else
			$('#botoweb.page').empty();
	};

	/**
	 * Prepares the page to be torn down.
	 *
	 * @private
	 */
	function detach_events () {
		botoweb.ajax.stop_all();

		var self = botoweb.ui.page;

		self.obj = null;

		console.log('PAGE: unload');
		$(self).triggerHandler('destroy');

		// Cache handlers before unbinding them all
		if (self.history.length > 1 && !(self.history[1].full in self.handler_cache)) {
			var handler_list = [];

			$.each($(self).data('events'), function (i, handlers) {
				$.each(handlers, function () {
					if (!this.namespace) {
						handler_list.push({ type: this.type, handler: this.handler });
					}
				});
			});

			self.handler_cache[self.history[1].full] = handler_list;
		}

		// Unbind anything not in a namespace
		$(self).unbind('.');

		if (!self.preserve_cache) {
			// TODO do this in a smarter way
			$.each(botoweb.env.models, function () {
				this.objs = {};
			});
		}

		self.preserve_cache = false;
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
	function init_page (url, html, fnc, opt) {
		botoweb.ui.markup.page_store(html, function (html) {
			store(url, html);
			fnc(html, opt);
		});
	}

	/**
	 * Passes off HTML which is read for high-level markup parsing to the next
	 * stage in markup parsing. Once the parsing is complete the existing page
	 * will be destroyed and the new page will be displayed. Any asynchronous
	 * parsing or data retrieval will be filled in after the page is displayed.
	 *
	 * Any JavaScript snippets in the HTML will be executed
	 *
	 * Triggers the load event on botoweb.ui.page which can be used to reverse
	 * any interface changes made while the page was loading.
	 *
	 * @param {String} html The HTML markup string.
	 */
	function show_page (html, opt) {
		detach_events(opt);
		var self = botoweb.ui.page;
		var old_loc = self.location;

		botoweb.ui.markup.page_show(html, function (node) {
			destroy(opt);

			$('#botoweb.page').append(node);

			console.log('PAGE: load');
			$(self).triggerHandler('load');
		});
	}

	/**
	 * Checks the URL for changes. All changes will trigger the change event on
	 * botoweb.ui.page, and any change to the hash_href (the markup page URL)
	 * will cause the current page to be destroyed and the new page loaded.
	 *
	 * @private
	 */
	function check (force) {
		var self = botoweb.ui.page;
		var loc = self.get_location();

		if (force || !self.history.length || loc.hash != self.location.hash) {
			var new_page = false;

			// If the base page has changed, load it, otherwise rely on page
			// change listeners. This allows pages to maintain state when the
			// URL changes, otherwise the page will just be reloaded by the
			// default listener.
			if (!self.history.length || loc.hash_href != self.location.hash_href)
				new_page = true;

			self.location = loc;

			// Remove all non-global events attached to the central forms obj
			if ($(botoweb.ui.forms).data('events')) {
				var to_remove = [];

				$.each($(botoweb.ui.forms).data('events'), function () {
					$.each(this, function () {
						if (this.namespace != 'global')
							to_remove.push(this)
					});
				});

				$.each(to_remove, function () {
					$(botoweb.ui.forms).unbind(this.type, this.handler);
				});
			}

			// If a new page was loaded there probably will not be anything
			// bound to the change event, but we trigger it anyway to support a
			// generic action which occurs every time the page changes.
			// We support blockable global handlers by calling them only if the
			// non-global do not return false.
			console.log('PAGE: change');
			if ($(self).triggerHandler('change.', [loc, new_page]) !== false) {
				// Signal that the page should be loaded
				new_page = true;
				$(self).triggerHandler('change.global', [loc, new_page]);
			}

			self.history.unshift(loc);

			if (self.history.length > 20) {
				var old_loc = self.history.pop();

				// Are there any other pages in the history with the same URL?
				var dupes = $.grep(self.history, function (l) {
					return l.full == old_loc.full;
				}).length;

				// If not, delete this page's cache.
				if (dupes == 0) {
					delete self.cache[old_loc.full];
					delete self.handler_cache[old_loc.full];
				}
			}

			if (new_page) {
				// Set changed flag to
				self.load(loc, null, { changed: true });
			}
		}
	}

	/**
	 * Forces the change event to be triggered again. This may be useful for
	 * extensions which maintain state between pages.
	 */
	this.force_change = function () {
		check(true);
	};

	/**
	 * Does a soft refresh by reloading the current URL without refreshing the
	 * browser.
	 */
	this.refresh = function (no_cache) {
		self.preserve_cache = !no_cache;
		this.load(this.location, show_page, { refresh: 1 });
	}

	this.location = this.get_location();
}();