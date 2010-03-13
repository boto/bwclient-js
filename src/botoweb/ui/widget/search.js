/**
 * @author    Ian Paterson
 * @namespace botoweb.ui.widget.search
 */

/**
 * Generates a search form.
 *
 * @param node the node containing the search parameters.
 */
botoweb.ui.widget.Search = function(node) {
	var self = this;

	self.node = $(node).addClass('widget-search');
	self.header = self.node.find(botoweb.ui.markup.sel.header);
	self.model = botoweb.env.models[self.node.attr(botoweb.ui.markup.prop.model)];
	self.results = new botoweb.ui.widget.SearchResults(self.node.find(botoweb.ui.markup.sel.search_results), self.model);
	self.def = self.node.attr(botoweb.ui.markup.prop.def);
	self.props = [];
	self.fields = [];

	// Evaluate JSON search defaults
	if (self.def)
		eval('self.def = ' + self.def);

	// Find any properties matching the search parameters
	$.each((self.node.attr(botoweb.ui.markup.prop.attributes) || 'all').split(','), function() {
		if (this == 'all') {
			self.props = self.model.props;
			return;
		}

		if (this in self.model.prop_map) {
			var prop = self.model.prop_map[this];

			self.props.push(prop);

			var field = botoweb.ui.forms.prop_field(prop);

			field.add_field();

			field.node
				.appendTo(self.header)
				.show();

			self.fields.push(field);
		}
	});


	$(self.header).find('input').keyup(function(e) {
		if (e.keyCode == 13)
			self.submit();
	});

	self.submit = function() {
		var query = [];

		if (self.def)
			query = self.def.slice();

		$.each(self.fields, function(i, field) {
			$.each(field.fields, function () {
				var val = $(this).val();

				if ($.isArray(val))
					query.push([field.prop.meta.name, 'like', $.map(val, function(v) { return '%' + v + '%'; })]);
				else if (val)
					query.push([field.prop.meta.name, 'like', '%' + val + '%']);
			});
		});

		self.results.reset();

		self.model.query(query, function(results, page, count, next_page) {
			if (results.length) {
				self.results.update(results, page, count, next_page);
			}

			return false;
		});
	};


	$('<a/>')
		.attr('href', '#')
		.addClass('ui-button ui-state-default ui-corner-all')
		.html('<span class="ui-icon ui-icon-search"></span>Search')
		.click(function(e) {
			e.preventDefault();
			self.submit();
		})
		.appendTo($('<div><label>&nbsp;</label></div>').appendTo(self.header));

	$('<br/>')
		.addClass('clear')
		.appendTo(self.header);
};
