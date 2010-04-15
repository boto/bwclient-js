/**
 * @author    Ian Paterson
 * @namespace botoweb.ui.widget.search_results
 */

/**
 * Displays templated search results.
 *
 * @param node the node containing the search result template.
 */
botoweb.ui.widget.SearchResults = function(node, model, opts) {
	var self = this;

	self.node = $(node);
	self.model = model;
	self.template = self.node.find(botoweb.ui.markup.sel.object + ':first')
		.addClass('object')
		.clone();
	self.node.empty();
	self.def = self.node.attr(botoweb.ui.markup.prop.def);
	self.limit_pages = self.node.attr("bwLimit");
	self.opts = opts || { };
	self.num_results = 0;
	self.search_id = 0;
	self.stopped = false;
	self.guide_block = null;

	self.next_page;

	self.update = function(results, page, count, next_page, search_id) {
		self.next_page = next_page;

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
					self.opts.min_memory = true;
				else
					self.opts.min_memory = false;
			}

			self.data_table.opts.no_redraw = self.opts.min_memory;
		}

		var c = 0;
		var sent_next_query = false;
		var done = false;

		// Do not allow another page to be loaded if we are at the requested limit
		if (self.limit_pages != 'none' && self.limit_pages * 1 - 1 <= page)
			done = true;

		function add_row(block) {
			if (search_id != self.search_id)
				return;

			self.num_results++;
			c++;

			if (self.data_table) {
				block.node.find('td:first').append($('<!-- BWOBJ ' + block.model.name + '/' + block.obj_id + ' -->'));
				self.data_table.append(block.node);

				// Update the progress bar no more than 100 times
				// to avoid unnecessary overhead
				if (self.num_results == 1 || self.num_results % Math.ceil(count / 100) == 0 && self.num_results - 1 % Math.ceil(count / 100) != 0)
					self.data_table.update_progress(Math.round(10000 * self.num_results / count) / 100, 'Total ' + count + ' results');
			}
			else {
				self.node.append(block.node);
			}

			if (self.num_results >= count || done && c >= results.length) {
				if (self.data_table)
					self.data_table.stop();

				self.next_page = null;
			}
			else if (c >= results.length && !sent_next_query && !self.stopped) {
				self.want_page = page + 1;
				sent_next_query = true;
				if (next_page) {
					next_page();
				}
			}

			if (self.num_results == 50 && self.data_table)
				self.data_table.data_table.fnDraw();
		}

		$.each(results, function () {
			if (!self.guide_block) {
				self.guide_block = new botoweb.ui.markup.Block(self.template.clone(), {
					obj: this,
					onready: add_row,
					editable: false,
					no_cache: true
				});
			}
			else {
				self.guide_block.clone(self.template.clone(), {
					obj: this,
					onready: add_row,
					editable: false,
					no_cache: true
				});
			}
		});
	}

	self.stop = function() {
		self.stopped = true;
	}

	self.resume = function() {
		self.stopped = false;

		if (self.data_table)
			self.data_table.stopped = false;

		if (self.next_page)
			self.next_page();
	}

	self.reset = function() {
		self.stopped = false;

		self.num_results = 0;
		self.search_id++;

		if (self.data_table)
			self.data_table.reset();

		// Stop any existing searches
		//botoweb.ajax.stop_by_url(self.model.href);
	}

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

	var dt_opts = {
		stop: true,
		template: self.template
	};

	if (self.node.is('tr, tbody')) {
		setTimeout(function() {
			self.data_table = new botoweb.ui.widget.DataTable(self.node.parent('table'), dt_opts);
		}, 10);
	}
	else if (self.node.is('table')) {
		setTimeout(function() {
			self.data_table = new botoweb.ui.widget.DataTable(self.node, dt_opts);
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
