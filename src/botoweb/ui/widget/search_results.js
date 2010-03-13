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
	self.template = self.node.find(botoweb.ui.markup.sel.object + ':eq(0)')
		.addClass('object')
		.clone();
	self.node.empty();
	self.def = self.node.attr(botoweb.ui.markup.prop.def);
	self.limit_pages = self.node.attr("bwLimit");
	self.opts = opts || { };
	self.num_results = 0;
	self.stopped = false;
	self.guide_block = null;

	self.update = function(results, append, count, next_page) {
		if (!results || results.length == 0)
			return;
		if(!self.model)
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

		function add_row(block) {
			if (self.stopped)
				return;

			self.num_results++;
			c++;

			if (self.data_table) {
				self.data_table.append(block.node);

				// Update the progress bar no more than 100 times
				// to avoid unnecessary overhead
				if (self.num_results == 1 || self.num_results % Math.ceil(count / 100) == 0 && self.num_results - 1 % Math.ceil(count / 100) != 0)
					self.data_table.update_progress(Math.round(10000 * self.num_results / count) / 100, 'Total ' + count + ' results');
			}
			else
				self.node.append(block.node);

			if (self.num_results >= count) {
				self.data_table.stop();
			}
			else {
				if (self.num_results == 50)
					self.data_table.data_table.fnDraw();

				if (c >= results.length / 2 && !sent_next_query) {
					sent_next_query = true;
					setTimeout(next_page, 50);
				}
			}
		}

		$.each(results, function () {
			if (!self.guide_block) {
				self.guide_block = new botoweb.ui.markup.Block(self.template.clone(), {
					obj: this,
					onready: add_row,
					editable: false
				});
			}
			else {
				self.guide_block.clone(self.template.clone(), {
					obj: this,
					onready: add_row,
					editable: false
				});
			}
		});
	}

	self.stop = function() {
		self.stopped = true;
	}

	self.reset = function() {
		self.stopped = false;

		if (self.data_table)
			self.data_table.reset();
		self.num_results = 0;

		// Stop any existing searches
		botoweb.ajax.stop_by_url(self.model.href);
	}

	if (self.def == 'all') {
		self.model.all(function(results, page, count, next_page) { self.update(results, page, count, next_page); return false; });
	}
	else if (self.def) {
		// Evaluate JSON search filters
		eval('self.def = ' + self.def);

		if ($.isArray(self.def))
			self.model.query(self.def, function(results, page, count, next_page) { self.update(results, page, count, next_page); return false; });
		else
			self.model.find(self.def, function(results, page, count, next_page) { self.update(results, page, count, next_page); return false; });
	}

	var dt_opts = {stop: true};

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

	$(botoweb.ui.page).bind('unload', function () { self.stop() });
};
