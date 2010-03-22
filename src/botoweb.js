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

		var page = 0;
		var process = function(xml, xhr){
			xml = $(xml);
			var data = [];

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

			function next_page() {
				if (url)
					botoweb.ajax.get(url, process);
			}

			// Get the next page if the callback returns true
			if (fnc && fnc(data, page++, count, next_page))
				next_page();
		}

		return botoweb.ajax.get(url, process);
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

		var page = 0;
		var process = function(xml, xhr){
			var data = [];
			$(xml).find(obj_name).each(function(){
				var obj = botoweb.xml.to_obj(this, opt);

				data.push(obj);
			});
			url = $(xml).find('link[rel=next]').attr('href');

			var count = 0;

			if (xhr && typeof xhr.getResponseHeader == 'function')
				count = xhr.getResponseHeader('X-Result-Count');

			function next_page() {
				if (url)
					botoweb.ajax.get(url, process);
			}

			// Get the next page
			if (fnc(data, page++, count, next_page))
				next_page()
		}

		return botoweb.ajax.get(url, process, function () {
			fnc([], 0, 0);
		});
	},

	//
	// Function: get_by_id
	// Find a specific object by ID
	//
	get_by_id: function(url, id, fnc){
		if (!id)
			return fnc();

		botoweb.ajax.get(url + "/" + id, function(data){
			if ($(data).children())
				fnc(botoweb.xml.to_obj($(data).children().first()));
			else
				fnc();
		}, fnc);
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
		alert(url + "\n\n" + (new XMLSerializer()).serializeToString(doc));
		//fnc({status: 201, getResponseHeader: function() { return '123' ;}});
		//return

		opts = {
			url: url,
			processData: false,
			data: doc
		}
		if(method){
			opts.type = method;
		} else {
			opts.type = "PUT";
		}

		if(fnc){
			opts.complete = function (data) {
				// Not supported yet
				//if ($(data).children())
				//	fnc(botoweb.xml.to_obj($(data).children().first()));
				//else
					fnc();
			};
			opts.error = botoweb.util.error
		}
		$.ajax(opts);
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
			botoweb.util.log('API initialization complete');

			botoweb.ldb.name = env.cfg.db.name;
			botoweb.ldb.title = env.cfg.db.title;
			botoweb.ldb.size_mb = env.cfg.db.size_mb;
			botoweb.ldb.version = env.version;

			// Prepare the database according to the environment settings
			botoweb.ldb.prepare(function (db) {
				botoweb.util.log('Data initialization complete, begin synchronizing');
				botoweb.ui.init();
				if (fnc)
					fnc();
				botoweb.ldb.sync.update();

				// Update the local database every 2 minutes
				setInterval(botoweb.ldb.sync.update, 2 * 60 * 1000);
			}, botoweb.util.error);
		}, opt);
	}
};