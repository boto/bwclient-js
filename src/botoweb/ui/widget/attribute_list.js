/**
 * @author    Ian Paterson
 * @namespace botoweb.ui.widget.attribute_list
 */

/**
 * Displays object editing links based on the actions available to the user.
 *
 * @param node where to insert the icons.
 */
botoweb.ui.widget.AttributeList = function(node, model) {
	var self = this;

	self.node = $(node).addClass('widget-attribute_list clear').attr(botoweb.ui.markup.prop.widget, '');
	self.template = $('<div/>').append(self.node.contents().clone()).addClass('template');
	self.node.empty();
	self.model = model;
	self.properties = [];
	self.follow_props = [];
	self.sequence = self.node.attr(botoweb.ui.markup.prop.attributes);
	self.existing_only = self.node.attr(botoweb.ui.markup.prop.existing_only) || '';
	self.existing_only = self.existing_only.split(',');

	if (self.sequence && self.sequence != 'all')
		self.sequence = self.sequence.split(',')
	else
		self.sequence = $.map(self.model.props, function(prop) { return prop.meta.name });

	self.properties = $.map(self.sequence, function(name, num) {
		if (!name) {
			return {meta:{label: '&nbsp;'}};
		}
		/()/.test(name);
		var n = name.replace(/\.(.*)/, '');
		if(!self.model)
			return;
		if (!(n in self.model.prop_map))
			return;

		var prop = self.model.prop_map[n];

		if (!prop.meta.read)
			return;

		self.follow_props.push(RegExp.$1);

		return prop;
	});

	self.num_columns = 2;

	if (self.node.get(0).className.indexOf('columns_') >= 0)
		self.num_columns = self.node.get(0).className.replace(/.*columns_(\d+).*/, '$1') * 1;

	self.per_column = Math.ceil(self.properties.length / self.num_columns);

	self.columns = [];

	for (var i = 0; i < self.num_columns; i++) {
		self.columns.push($('<div/>')
			.addClass('al p' + Math.floor(100 / self.num_columns))
			.appendTo(self.node));
	}

	$(self.properties).each(function(num, props) {
		var c = self.columns[Math.floor(num / self.per_column)];

		var template = self.template.find(botoweb.ui.markup.sel.attribute.replace(']', '=' + props.meta.name + ']'));
		var label = self.template.find('label[for=' + props.meta.name + ']:first');

		if (template.length) {
			// Ignore nested attributes, these may belong to different objects via references
			if (template.parents(botoweb.ui.markup.sel.attribute).length)
				template = {};
			else
				var t = template.parent('*:not(.template):last');
				if (t.length)
					template = t;
		}

		if (!label.length)
			label = null;

		var container = $('<div/>')
			.addClass('property');

		if (self.node.hasClass('delay_load'))
			container.addClass('delay_load');

		var follow = '';

		if (self.follow_props[num])
			follow = '.' + self.follow_props[num];

		if (template.length)
			container.append(template.clone());
		else if (props.meta.list) {
			container.append(
				$('<ol class="plain"/>').append($('<li/>').attr(botoweb.ui.markup.prop.attribute, props.meta.name + follow))
			);
		}
		else
			container.attr(botoweb.ui.markup.prop.attribute, props.meta.name + follow);

		c.append(
			$('<div/>')
				.addClass('row ' + (((num % self.per_column) % 2) ? 'odd' : 'even'))
				.append(
					(label || $('<label/>')
						.addClass('property_label')
						.html(props.meta.label)),
					container,
					$('<br class="clear"/>')
				)
		);
	});
};
