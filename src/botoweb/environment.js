/**
 * Structures object and model data and provides abstractions for loading and
 * manipulating the data.
 *
 * @author Chris Moyer
 */

/**
 * This is the Environment class, intended to be instantiated
 * i.e: env = new botoweb.Environment("data");
 * Note that the loading of the routes and users happens asynchronously,
 * so if you need to make sure everything is loaded before you use it,
 * pass in a callback:
 * new botoweb.Environment("data", function(env){
 *     alert(env.user.username);
 * });
 *
 * @param {String} base_url The base URL that we are operating on
 * @param {Function} fnc Optional callback function to call after we finish loading
 * @param {Object} cfg The environment configuration.
 */
botoweb.Environment = function(base_url, fnc, cfg) {
	botoweb.env = this;

	this.base_url = base_url;
	this.user = null;
	this.model_names = [];
	this.models = {};

	// Default environment
	this.cfg = $.extend(true, {
		static_host: '',

		time_delta: 0,

		// The number of pages of results to fetch into a searchResults widget
		// before pausing, use bwLimit="none" to override.
		search_result_pages: 0,

		templates: {
			home: 'index.html',
			model: '{{ name }}.html',

			// URLs for pages intended for use in editing or creating Objects
			editor: {}
		},

		// Local database metadata
		db: {
			name: '',
			title: '',
			size_mb: 5,

			// These models will be downloaded locally and kept synchronized
			sync_models: []
		},

		// Functions allowing custom markup modification, such as expanding a
		// container of a certain class into multiple nested divs
		markup: {
			// Functions to run before storing static HTML of a page or template
			page_store: [],

			// Functions to run on static DOM after synchronous markup is parsed
			page_show: []
		},

		styles: {
			button: 'ui-button ui-state-default ui-corner-all',
			active: 'ui-state-active',
			hover: 'ui-state-hover',
			focus: 'ui-state-focus',
			primary: 'ui-priority-primary',
			secondary: 'ui-priority-secondary'
		},

		// Allows parts of DOM to be removed
		conditions: {},

		// Allows generic modification of the DOM
		triggers: {},

		format: {
			email_href: function (email, prop, obj) {
				return 'mailto:' + email;
			},
			external_href: function (href, prop, obj) {
				this.attr('target', '_blank');
				return href;
			},
			picklist_result: function (text, obj) {
				return '<div class="ar small">' + obj.model.name + '</div>' + text;
			}
		},

		// Map status code number to a function accepting params url, xhr
		ajax_errors: {}
	}, cfg);

	var self = this;

	// Parse API xml to set up environment
	botoweb.ajax.get(this.base_url, function(xml, xhr){
		xml = $(xml);

		// Setup our name
		self.name = xml.find("Index").attr("name");

		// Get our version
		self.version = xml.find("Index").attr("version");
		$("#apiversion").text(self.version);

		// Initialize the model names so that references to other models can be
		// verified while building the Model instances.
		xml.find('api').each(function () {
			self.models[$(this).attr('name')] = null;
		});

		// Set our routes and model APIs
		xml.find('api').each(function(){
			var m = botoweb.xml.to_model(this);
			self.models[m.name] = m;
			self.model_names.push(m.name);
		});

		// Do not allow the user object to be cached - it is a minimal form of
		// the actual User object so we need to be able
		self.user = botoweb.xml.to_obj(xml.find('Index > User:first'), { no_cache: true });

		try {
			// Find the time offset between the server and client computer
			var server_date = Date.parse(xhr.getResponseHeader('Date'));
			var client_date = new Date().valueOf();

			self.cfg.time_delta = server_date - client_date;
		} catch (e) {}

		if(fnc){ fnc(self); }
	});
};