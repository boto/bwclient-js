// Picklist Input
// Author: Ian Paterson
// Author: Chris Moyer
//
// Much of this is taken DIRECTLY from Ian's implementation of
// the Picklist in $ui.forms.Picklist, but
// I wanted an abstraction to let me use it elsewhere
//
// You can create a new Picklist field by simply doing:
// 	botoweb.ui.forms.inputs.Picklist(node, botoweb.env.models.ModelName);
//
// You can also specify a custom "onSelect" callback as the third option:
// 	botoweb.ui.forms.inputs.Picklist(node, my_model, function(obj){
// 		alert("Selected: " + obj.id);
// 	});

var $util = botoweb.util;
var $ui = botoweb.ui;
var $forms = $ui.forms;
var $ldb = botoweb.ldb;

if($forms.inputs == undefined)
	$forms.inputs = {};

$forms.inputs.Picklist = function (node, model, onSelect) {
	var self = this;
	self.model = model;
	self.node = node;
	self.search_box = node.find("input");
	self.search_results = $ui.nodes.search_results;
	self.allow_multiple = false;
	self.template = null;
	self.onSelect = onSelect || function(){};

	var field = self.node.find('.ui-picklist');
	var new_field = false;

	if (!field.length) {
		field = $('<div class="ui-picklist"><ol class="selections"></ol><div class="search clear"></div></div>');
		self.node.prepend(field);
	}

	// Picklists may be marked as not searchable which means that the user
	// cannot search for new items to add to the list.
	if (self.node) {
		var searchable = self.node.attr($ui.markup.prop.searchable);

		if (searchable == 'false')
			field.find('.search, .selections').hide();

		self.filters = self.node.attr($ui.markup.prop.filter);

		if (self.filters) {
			try {
				self.filters = $util.interpolate(self.filters, self.model);
				eval('self.filters = ' + self.filters);
			} catch (e) { console.error('Filter parsing error: ' + self.filters) }
		}
	}

	var selections = field.find('.selections:first');
	var search = field.find('.search:first');
	var search_results = $ui.nodes.search_results;


	var selecting = false;
	var autosearch;
	var autohide;
	var prev_value;
	var focused = false;
	var sortable = false;



	function navigate_results (e) {
		if (e.keyCode == 13) {
			add_selection(self.search_results.find('button.ui-state-highlight').attr('id'));
			return;
		}

		if (e.keyCode != 40 && e.keyCode != 38)
			return;

		var current = self.search_results.find('button.ui-state-highlight');

		var target;

		if (e.keyCode == 40)
			target = current.next().addClass('ui-state-highlight');
		else
			target = current.prev().addClass('ui-state-highlight');

		if (target.length) {
			var position = target.position();

			self.search_results.stop();
			self.search_results.scrollTo(target, 250, {offset: -60});

			current.removeClass('ui-state-highlight');
		}
	}

	function cancel_search (clear_value) {
		selecting = false;
		self.search_results.hide();
		self.search_box.unbind('keyup', navigate_results);

		if (clear_value)
			self.search_box.val('');
	}

	function add_selection (obj) {
		if (!obj)
			return;

		// obj may just be a string ID
		if (typeof obj == 'string') {
			self.model.get(obj, add_selection);
			return;
		}

		// Don't add if already selected
		if (selections.find('#' + obj.id).length == 0) {
			if (!self.allow_multiple) {
				selections.empty();
				self.node.find('.editing_template').parent().remove();
			}

			var template_field;
			if (self.template) {
				template_field = self.add_field(obj, { use_template: true });
			}

			if (obj && obj.model) {
				selections.append(
					$('<li class="sortable_item selection clear"/>')
						.attr('id', obj.id)
						.attr($ui.markup.prop.model, obj.model.name)
						.html(' ' + botoweb.env.cfg.format.picklist_result(obj.data.name.toString(), obj))
						.prepend(
							$ui.button('', { icon: 'ui-icon-close', no_text: true, mini: true, primary: false })
								.addClass('ui-state-error')
								.click(function () {
									$(this).parent().remove();

									if (template_field)
										template_field.remove();
								})
						)
						.prepend((sortable) ? $('<span class="ui-icon"/>') : null)
				);

				if (sortable)
					$ui.sort_icons(selections);
			}
		}

		cancel_search(true);

		// Call the optional callback, don't worry
		// if it was null we set it to a null function
		self.onSelect(obj);
	}

	function do_search() {
		var filterQuery = self.filters || [];
		filterQuery.push(['name', 'like', '%' + self.search_box.val() + '%']);
		filterQuery.push(['name','sort','asc']);
		self.model.query(filterQuery, function (objs) {
			self.search_results.hide();
			selecting = true;

			// Reposition the search results
			var offset = search.offset();
			var results_offset = self.search_results.offset();
			var w = self.search_box.width();
			var h = self.search_box.height();

			var result_node = self.search_results.find('.search_results').empty();
			var items = [];

			self.search_results
				.unbind('mousedown mouseout')
				.mousedown(function () {
					setTimeout(function () {
						clearTimeout(autohide);
					}, 100);
				})
				.mouseout(function (e) {
					self.search_box.focus();
				});

			if (objs.length == 0) {
				result_node.html('<div class="jc"><strong>No results found</strong></div>');
			}
			else {
				// Get the string form of each object
				$.each(objs, function () {
					items.push({ obj: this, text: this.data.name.toString() });
				});

				// Sort alphabetically, ignoring a, an, and the
				items = items.sort(function (a, b) {
					return (a.text.toLowerCase().replace(/^\s*((the|a|an)\s+)?/, '') > b.text.toLowerCase().replace(/^\s+(the |a |an )?/, '')) ? 1 : -1;
				});

				$.each(items, function (i, data) {
					result_node.append(
						$ui.button(botoweb.env.cfg.format.picklist_result(data.text, data.obj), { corners: [0,0,0,0] })
							.attr('id', data.obj.id)
							.click(function () {
								add_selection(data.obj);
							})
					);
				});

				result_node.find('*:first').addClass('ui-state-highlight');
			}

			self.search_box.keyup(navigate_results);

			var new_h = (objs.length || 1) * 20;

			if (results_offset.left != offset.left || results_offset.top != offset.top + h) {
				self.search_results.css({
					left: offset.left + 1 + 'px',
					top: offset.top + h + 1 + 'px',
					width: w - 4 + 'px',
					height: ((new_h > 200) ? 200 : new_h) + 'px'
				});

				if (new_h > 200)
					result_node.css('padding-right', '15px');

				self.search_results.slideDown(function () {
					if (new_h > 200)
						result_node.css('padding-right', '');
				});
			}

			self.search_results.show();
		});
	}
	self.search_timeout = null;

	node.find("input").bind("keyup", function(){
		if(self.search_timeout){
			clearTimeout(self.search_timeout);
		}
		// Only do an auto-search if they have entered something
		if(self.search_box.val()){
			self.search_timeout = setTimeout(do_search, 1000);
		}
	});
	node.find("button").bind("click", function(){
		do_search();
	});
};
