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
			self.props.push(self.model.props);
			return;
		}

		var name = this;
		var prop = $.grep(self.model.props, function(p) {
			return p.meta.name == name;
		});

		if (prop)
			self.props.push(prop[0]);
	});

	botoweb.ui.markup.parse.editing_tools(self.node);

	for (var i in self.props) {
		if (!(i in self.props)) {
			$(i).log(self.model.name + ' does not support this property');
			continue;
		}

		var prop = self.props[i];

		prop.value = '';
		var field = 0//botoweb.ui.forms.property_field(prop);

		if (!field)
			continue;

		$(field.node).appendTo(self.header);
		self.fields.push(field);
	}

	$(self.header).find('input').keyup(function(e) {
		if (e.keyCode == 13)
			self.submit();
	});

	self.submit = function() {
		var query = [];

		if (self.def)
			query = self.def.slice();

		$(self.fields).each(function() {
			var val;

			if (this.fields.length > 1) {
				val = [];
				$(this.fields).each(function() {
					if (this.val())
						val.push(this.val());
				});
			}
			else
				val = this.field.val();

			if ($.isArray(val))
				query.push([this.field.attr('name'), 'like', $.map(val, function(v) { return '%' + v + '%'; })]);
			else if (val)
				query.push([this.field.attr('name'), 'like', '%' + val + '%']);
		});

		self.results.reset();

		self.model.query(query, function(results, page, count) {
			if (results.length) {
				return self.results.update(results, page, count) && page < 10;
			}
			else if (page == 0){
				botoweb.ui.alert('The search did not return any results.');
			}
			// TODO data save callback
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
