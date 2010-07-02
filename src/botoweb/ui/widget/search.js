/**
 * @author    Ian Paterson
 * @namespace botoweb.ui.widget.search
 */

/**
 * Generates a search form.
 *
 * @param node the node containing the search parameters.
 */
botoweb.ui.widget.Search = function(node, block) {
	var self = this;

	self.node = $(node).addClass('widget-search');
	self.header = self.node.find(botoweb.ui.markup.sel.header);
	self.model = botoweb.env.models[self.node.attr(botoweb.ui.markup.prop.model)];

	if(!self.model){
		console.error("Model not found: " + self.node.attr(botoweb.ui.markup.prop.model));
		return;
	}

	self.results = new botoweb.ui.widget.SearchResults(self.node.find(botoweb.ui.markup.sel.search_results), self.model, {
		block: block
	});
	self.def = self.node.attr(botoweb.ui.markup.prop.def);
	self.props = [];
	self.fields = [];

	// Evaluate JSON search defaults
	if (self.def) {
		self.def = botoweb.util.interpolate(self.def, (block.obj || block.model));
		eval('self.def = ' + self.def);
	}

	// Find any properties matching the search parameters
	$.each((self.node.attr(botoweb.ui.markup.prop.attributes) || 'all').split(','), function() {
		if (this == 'all') {
			self.props = self.model.props;
			return;
		}

		if (this in self.model.prop_map) {
			var prop = self.model.prop_map[this];

			self.props.push(prop);

			var field = botoweb.ui.forms.prop_field(prop, {
				def: ''
			});

			field.edit();

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
			var val = field.val();

			var op = '=';
			var wrap = '';

			// Anything with choices has to use the = op regardless of type
			if (field.prop.meta.choices && field.prop.meta.choices.length) { }

			// Strings use like comparison
			else if (field.prop.is_type('str', 'string', 'blob')) {
				op = 'like';
				wrap = '%';
			}

			if (val.length > 1)
				query.push([field.prop.meta.name, op, $.map(val, function(v) { return wrap + v.val + wrap; })]);
			else if (val.length && val[0].val)
				query.push([field.prop.meta.name, op, wrap + val[0].val + wrap]);
		});

		self.results.reset();

		var search_id = self.results.search_id;

		$(botoweb.ui.page).triggerHandler('search_begin', [self.model, query]);

		self.model.query(query, function(results, page, count, next_page) {
			if (page == 0)
				$(botoweb.ui.page).triggerHandler('search_receive', [count]);

			if (results.length)
				self.results.update(results, page, count, next_page, search_id);

			return false;
		}, { no_cache: true });
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
