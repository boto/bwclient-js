/**
 * JavaScript API for use with botoweb with integrated local storage for
 * enhanced data access and querying performance.
 *
 * @author Chris Moyer
 * @author Ian Paterson
 */
var botoweb = {
	env: {},
	util: {},

	//
	// Get all items at this url
	//
	all: function(url, obj_name, fnc){
		return botoweb.find(url, null, obj_name, fnc);
	},

	//
	// Find items at this URL using optional filters
	// @param url: The URL to search at
	// @param filters: The Filters to apply (or null for none), this should be of the form {name: value, name2: value2}
	// @param fnc: The function to call back to
	//
	find: function(url, filters, model_names, fnc, opt){
		// Apply the filters
		url += "?";
		for (var filter in filters){
			url += filter + "=" + filters[filter] + "&";
		}

		if ($.isArray(model_names))
			model_names = model_names.join(', ');

		var ts = new Date().valueOf();

		var page = 0;
		var process = function(xml, xhr){
			xml = $(xml);
			var data = [];

			var t = new Date().valueOf();
			console.log('Completed botoweb find in ' + (t - ts) + 'ms');

			xml.find(model_names).each(function () {
				var obj = botoweb.xml.to_obj(this, opt);
				if(obj.id){
					data.push(obj);
				}
			});
			url = xml.find('link[rel=next]').attr('href');

			var count = 0;

			if (xhr && typeof xhr.getResponseHeader == 'function')
				count = xhr.getResponseHeader('X-Result-Count');

			var next_page;

			if (url) {
				next_page = function () {
					setTimeout(function () {
						botoweb.ajax.get(url, process);
					}, 100);
				}
			}

			// Get the next page if the callback returns true
			if (fnc && fnc(data, page++, count, next_page) && next_page)
				next_page();

			ts = new Date().valueOf();
		}

			return botoweb.ajax.get(url, process, function () {
				fnc([], 0, 0);
			});
	},

	//
	// Advanced query searching
	// @param url: The URL to search at
	// @param query: The Query to use, this must be an array of tuples [name, op, value]
	// 		if "value" is a list, this is treated as an "or" and results in ["name" op "value" or "name" op "value"]
	// 		"op" must be one of the following: (=|>=|<=|!=|<|>|starts-with|ends-with|like)
	// @param fnc: The callback function
	//
	query: function(url, query, obj_name, fnc, opt){
		if (!opt) opt = {};

		// Build the query string
		parts = [];
		for (query_num in query){
			query_part = query[query_num];
			name = query_part[0];
			op = query_part[1];
			value = query_part[2];

			if(value.constructor.toString().indexOf("Array") != -1){
				parts.push('["' + name + '","' + op + '",["' + value.join('","') + '"]]');
			} else {
				parts.push('["' + name + '","' + op + '","' + value + '"]');
			}
		}

		url += "?query=[" + escape(parts.join(",") + "]");

		var ts = new Date().valueOf();

		var page = 0;
		var process = function(xml, xhr){
			var t = new Date().valueOf();
			console.log('Completed botoweb query in ' + (t - ts) + 'ms');

			var data = [];
			$(xml).find(obj_name).each(function(){
				var obj = botoweb.xml.to_obj(this, opt);

				data.push(obj);
			});
			url = $(xml).find('link[rel=next]').attr('href');

			var count = 0;

			try {
			if (xhr && typeof xhr.getResponseHeader == 'function')
				count = xhr.getResponseHeader('X-Result-Count');
			} catch (e) { }

			var next_page;

			if (url) {
				next_page = function () {
					setTimeout(function () {
						botoweb.ajax.get(url, process);
					}, 100);
				}
			}

			// Get the next page
			if (fnc(data, page++, count, next_page) && next_page)
				next_page()

			ts = new Date().valueOf();
		}

		return botoweb.ajax.get(url, process, function () {
			fnc([], 0, 0);
		});
	},

	//
	// Function: get_by_id
	// Find a specific object by ID
	//
	get_by_id: function(url, id, fnc, opt){
		if (!id)
			return fnc();

		botoweb.ajax.get(url + "/" + id, function(data){
			if ($(data).children())
				fnc(botoweb.xml.to_obj($(data).children().first(), opt));
			else
				fnc();
		}, (opt.error || fnc));
	},

	count: function(url, query, fnc){
		parts = [];
		for (query_num in query){
			query_part = query[query_num];
			name = query_part[0];
			op = query_part[1];
			value = query_part[2];

			if(value.constructor.toString().indexOf("Array") != -1){
				parts.push('["' + name + '","' + op + '",["' + value.join('","') + '"]]');
			} else {
				parts.push('["' + name + '","' + op + '","' + value + '"]');
			}
		}

		url += "?query=[" + escape(parts.join(",") + "]");

		$.ajax({
			type: "HEAD",
			url: url,
			complete: function(data) {
				fnc(data.getResponseHeader('X-Result-Count') || 0);
			}
		});
	},

	//
	// Functon: save
	// Save this ticket, or create a new one
	// the Data string is a simple class mapping
	// which is then converted into the proper XML document
	// to be sent to the server
	//
	save: function(url, obj_name, data, method, fnc){

		var doc = botoweb.xml.from_obj(obj_name, data);

		//DEBUG
		//alert(url + "\n\n" + (new XMLSerializer()).serializeToString(doc));
		console.log(method + ' ' + url + "\n\n" + (new XMLSerializer()).serializeToString(doc));
		//fnc({status: 201, getResponseHeader: function() { return '123' ;}});
		//return

		opts = {
			url: url,
			processData: false,
			data: doc
		};

		if(method){
			opts.type = method;
		} else {
			opts.type = "PUT";
		}

		if(fnc){
			opts.success = function (data) {
				if (!data)
					return fnc();

				// Parse new XML, ensure that it isn't loaded from cache
				var obj = botoweb.xml.to_obj($(data).children().first(), { no_cache: true });

				// Update cache regardless of whether the object was cached before
				// or not. This is *required* since SimpleDB will return a 404
				// for the object immediately after creation, which will break
				// any subsequent attempt to use the new object.
				obj.model.objs[obj.id] = obj;

				// Update database immediately. Usually a sync following the
				// update is good enough, but if another sync is already running
				// the update may spend some time in the update queue. This
				// ensures that the update is applied and allows pages to
				// refresh immediately.
				if (obj.model.local) {
					botoweb.ldb.sync.process([obj], null, null, function () {
						fnc(obj);
					});
				}
				// Non-local data will not update immediately. If the callback
				// needs to refresh the page to see updated data it should wait
				// about 1s before doing so.
				else
					fnc(obj);
			};
			opts.error = function (e) {
				botoweb.handle_error(e, fnc);
			}
		}
		$.ajax(opts);
	},

	del: function(url, fnc){
		$.ajax({
			type: "DELETE",
			url: url,
			success: fnc,
			error: function (e) {
				botoweb.handle_error(e, fnc);
			}
		});
	},

	handle_error: function (data, fnc) {
		var info = $(data.responseText);

		botoweb.ui.alert('The following error occurred while saving changes:<p><strong>' + info.find('description').html() + '</strong><br />' + info.find('message').html() + '</p>', 'Please check form values', fnc);
	},

	/**
	 * Simple Initialization script which handles the everyday setup that
	 * most of our apps will have to do. We make available the environment
	 * object in botoweb.env
	 *
	 * @param {String} href The location of the API root
	 */
	init: function(href, opt, fnc) {
		if (!opt) opt = {};

		new botoweb.Environment(href, function(env) {
			console.log('API initialization complete');

			if(botoweb.ldb){
				botoweb.ldb.name = env.cfg.db.name;
				botoweb.ldb.title = env.cfg.db.title;
				botoweb.ldb.size_mb = env.cfg.db.size_mb;
				botoweb.ldb.version = env.version;

				// Prepare the database according to the environment settings
				botoweb.ldb.prepare(function (db) {
					console.log('Data initialization complete, begin synchronizing');
					botoweb.ui.init();
					if (fnc)
						fnc();
					botoweb.ldb.sync.update();

					// Update the local database every 2 minutes
					setInterval(botoweb.ldb.sync.update, 2 * 60 * 1000);
				}, console.error);
			} else {
				if(fnc){
					fnc();
				}
			}
		}, opt);
	}
};

// console is a very annoying thing because it can cause errors in any browser
// that either does not have a console or does not have it open. This tests for
// console support and if it does not exist, console calls will melt away
// without causing actual errors.
try {
	console.log;
} catch (e) {
	console = {
		log: function () {},
		warn: function () {},
		error: function () {}
	};
}

