/**
 * @author    Ian Paterson
 * @namespace botoweb.ui.widget.search_results
 */

/**
 * Displays templated search results.
 *
 * @param node the node containing the search result template.
 */
botoweb.ui.widget.SearchResults = function(node, model, opt) {
	var self = this;

	self.node = $(node);
	self.model = model;
	self.template = self.node.find(botoweb.ui.markup.sel.object + ':first')
		.addClass('object')
		.clone();
	self.node.empty();
	self.def = self.node.attr(botoweb.ui.markup.prop.def);
	self.limit_pages = self.node.attr("bwLimit");
	self.opt = opt || { };
	self.num_results = 0;
	self.search_id = 0;
	self.outstanding_pages = 0;
	self.stopped = false;
	self.guide_block = null;

	if (self.def)
		self.def = botoweb.util.interpolate(self.def, ((self.opt.block) ? (self.opt.block.obj || self.opt.block.model) : self.model));

	if (!self.limit_pages) {
		self.limit_pages = botoweb.env.cfg.search_result_pages;
	}

	self.limit_pages = self.limit_pages || 'none';

	// Stores a running average of the time required to process each page of
	// results for use in balancing the markup parsing and query
	self.process_time = 0;

	self.next_page;

	self.update = function(results, page, count, next_page, search_id) {
		var ts = new Date().valueOf();
		var results_length = results.length;

		self.next_page = next_page;

		self.outstanding_pages++;

		if (!results || results.length == 0)
			return;
		if(!self.model)
			return;

		search_id = search_id || 0;

		if (search_id != self.search_id)
			return;

		if (self.data_table) {
			if (count) {
				if (count > 50)
					self.opt.min_memory = true;
				else
					self.opt.min_memory = false;
			}

			self.data_table.opt.no_redraw = self.opt.min_memory;
		}

		var c = 0;
		var sent_next_query = false;
		var next_page_timeout;
		var hit_limit = false;

		// Do not allow another page to be loaded if we are at the requested limit
		if (self.limit_pages != 'none' && self.limit_pages * 1 - 1 <= page)
			hit_limit = true;

		// If page is undefined, we have loaded all the results.
		if (page === undefined)
			hit_limit = true;

		function add_row(block) {
			if (search_id != self.search_id)
				return;

			self.num_results++;
			c++;

			if (self.data_table) {
				block.node.find('td:first').append($('<!-- BWOBJ ' + block.model.name + '/' + block.obj_id + ' -->'));
				self.data_table.append(block.node, block.obj);

				// Update the progress bar no more than 100 times
				// to avoid unnecessary overhead
				if (self.num_results == 1 || self.num_results % Math.ceil(count / 100) == 0 && self.num_results - 1 % Math.ceil(count / 100) != 0)
					self.data_table.update_progress(Math.round(10000 * self.num_results / count) / 100, 'Total ' + count + ' results');
			}
			else {
				self.node.append(block.node);
			}

			$(block.node).trigger('ready');

			if (self.num_results >= count || hit_limit && c >= results_length) {
				if (self.data_table) {
					if (hit_limit && self.num_results < count) {
						self.limit_pages = 'none';
						self.data_table.toggle_pause();
					}
					else
						self.data_table.stop();
				}

				if (!hit_limit || self.num_results >= count)
					self.next_page = null;
			}
			else if (c >= results_length && !sent_next_query && !self.stopped) {
				clearTimeout(next_page_timeout);

				console.warn('Running normal query');

				self.want_page = page + 1;
				sent_next_query = true;
				if (next_page)
					next_page();
			}

			if (c >= results_length) {
				self.outstanding_pages--;

				var t = new Date().valueOf();
				console.log('Completed markup parsing in ' + (t - ts) + 'ms');

				// NOTE: page starts at 0, not 1 so we have to add 1
				self.process_time = self.process_time * page / (page + 1) + (t - ts) / (page + 1);

				ts = t;
			}

			if (self.num_results == 50 && self.data_table)
				self.data_table.data_table.fnDraw();

			block = null;
		}

		// The first two pages are used to analyze how long each result set
		// requires to parse markup. Afterwards, queries will be sent for new
		// pages in advance
		if (page >= 2) {
			next_page_timeout = setTimeout(function () {
				if (!sent_next_query && !self.stopped && !hit_limit && next_page && self.outstanding_pages < 2) {
					console.warn('Running accelerated query at ' + Math.round(self.process_time * .75) + 'ms');
					self.want_page = page + 1;
					sent_next_query = true;
					if (next_page)
						next_page();
				}
			}, Math.round(self.process_time * .5));
		}

		$.each(results, function (i, obj) {
			if (!self.guide_block) {
				self.guide_block = new botoweb.ui.markup.Block((obj.node || self.template.clone()), {
					obj: (obj.obj || obj),
					onready: add_row,
					editable: false,
					no_cache: true
				});
			}
			else {
				self.guide_block.clone((obj.node || self.template.clone()), {
					obj: (obj.obj || obj),
					onready: add_row,
					editable: false,
					no_cache: true
				});
			}
		});

		results = null;
	}

	self.stop = function() {
		self.stopped = true;
	}

	self.resume = function() {
		if (self.data_table) {
			if (self.data_table.paused)
				return;

			self.data_table.stopped = false;
		}

		self.stopped = false;

		if (self.next_page)
			self.next_page();
	}

	self.reset = function() {
		self.stopped = false;

		self.num_results = 0;
		self.process_time = 0;
		self.search_id++;

		if (self.data_table)
			self.data_table.reset();

		self.limit_pages = self.node.attr("bwLimit");

		if (!self.limit_pages) {
			self.limit_pages = botoweb.env.cfg.search_results_pages;
		}

		self.limit_pages = self.limit_pages || 'none';

		// Stop any existing searches
		//botoweb.ajax.stop_by_url(self.model.href);
	}

	if (!self.opt.no_query) {
		if (self.def == 'all') {
			self.model.all(function(results, page, count, next_page) { self.update(results, page, count, next_page, 0); return false; }, { no_cache: true });
		}
		else if (self.def) {
			// Evaluate JSON search filters
			eval('self.def = ' + self.def);

			if ($.isArray(self.def))
				self.model.query(self.def, function(results, page, count, next_page) { self.update(results, page, count, next_page, 0); return false; }, { no_cache: true });
			else
				self.model.find(self.def, function(results, page, count, next_page) { self.update(results, page, count, next_page, 0); return false; }, { no_cache: true });
		}
	}

	var dt_opt = {
		stop: true,
		template: self.template,
		search_results: this
	};

	if (self.node.is('tr, tbody')) {
		setTimeout(function() {
			self.data_table = new botoweb.ui.widget.DataTable(self.node.parent('table'), dt_opt);
		}, 10);
	}
	else if (self.node.is('table')) {
		setTimeout(function() {
			self.data_table = new botoweb.ui.widget.DataTable(self.node, dt_opt);
		}, 10);
	}

	function init () {
		$(botoweb.ui.page)
			.unbind('load', init)
			.bind('destroy', function () {
				self.stop()
			})

		$('#botoweb.page').children().first().bind('reload', function () { self.resume() });
	}

	$(botoweb.ui.page).bind('load', init);
};
