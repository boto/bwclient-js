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
		
		else if (this == '__query__') {
			var field = new botoweb.ui.forms.Text(self.model.prop_map.sys_modstamp);
			field.__query__ = 1;

			field.edit();

			self.header.append(
				$('<label class="clear"/>')
					.text('Raw Query')
			);

			field.node
				.appendTo(self.header)
				.show();

			self.fields.push(field);
		}

		else {
			var prop;
			
			if (this in self.model.prop_map) {
				prop = self.model.prop_map[this];
			}
			else if (this == '__id__') {
				prop = new botoweb.Property('__id__', 'string', ['read'], null, {label: 'Item ID'})
			}
			else
				return;

			self.props.push(prop);

			var field = botoweb.ui.forms.prop_field(prop, {
				def: '',
				date_only: true
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
			
		var hasRawQuery = false;

		$.each(self.fields, function(i, field) {
			var val = field.val();
			
			if (field.__query__) {
				if (!val[0].val)
					return;
					
				try {
					eval('var data = ' + val[0].val);
					$.each(data, function () {
						query.push(this);
					});

					hasRawQuery = true;
				}
				catch(e) {
					console.error(e);
					alert('Query formatting error');
				}
				return;
			}

			var op = '=';
			var before = '';
			var after = '';

			// Anything with choices has to use the = op regardless of type
			if (field.prop.meta.choices && field.prop.meta.choices.length) { }

			// Strings use like comparison
			else if (field.prop.is_type('str', 'string', 'blob')) {
				op = 'like';
				before = after = '%';
			}

			// Dates use like comparison that ignores the time
			else if (field.opt.type == 'dateTime' || field.prop.is_type('dateTime')) {
				$.each(val, function () {
					this.val = this.val.replace(/(\d+)\/(\d+)\/(\d+).*/, '$3-$1-$2');
				});
				op = 'like';
				after = '%';
			}

			if (val.length > 1)
				query.push([field.prop.meta.name, op, $.map(val, function(v) { 
					if (v.val.indexOf('%') >= 0)
						return v.val;
						
					return before + v.val + after; 
				})]);
			else if (val.length && val[0].val) {
				if (val[0].val.indexOf('%') >= 0)
					before = after = '';
					
				query.push([field.prop.meta.name, op, before + val[0].val + after]);
			}
		});
		
		self.results.reset();
		
		// Remove the 1 page limit if the query is now blank
		if (hasRawQuery) {
			this.results.limit_pages = 1;
		}
		
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
	}).parse();
};
