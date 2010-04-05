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

			self.header.append(
				$('<label class="clear"/>')
					.text(prop.meta.label)
			);

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

		var search_id = self.results.search_id;

		self.model.query(query, function(results, page, count, next_page) {
			if (results.length) {
				self.results.update(results, page, count, next_page, search_id);
			}

			return false;
		});
	};

	self.header.append(
		$('<br class="clear"/>'),
		botoweb.ui.button('Search', {icon: 'ui-icon-search'})
			.click(function(e) {
				self.submit();
				return false;
			}),
		$('<br class="clear"/>')
	);

	new botoweb.ui.markup.Block(self.node, {
		model: self.model
	});
};
