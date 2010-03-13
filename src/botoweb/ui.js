/**
 * Provides an interface and support of special HTML markup for botoweb.
 *
 * @author Ian Paterson
 */

botoweb.ui = {
	widget: {},
	forms: {},

	/**
	 * Initializes the interface.
	 *
	 * NOTE: currently this is used for testing the local DB sync.
	 */
	init: function() {
		$(botoweb.ldb.sync).bind('end.init', function () {
			botoweb.util.log('Synchronizing complete');
			botoweb.ui.page.init();
			$(botoweb.ldb.sync).unbind('end.init');
		});

		$('header nav li').addClass('ui-state-default ui-corner-top');
		$('header nav').show();


		var loc = botoweb.ui.page.location;

		if (!loc.hash_href)
			document.location.href += '#' + botoweb.env.cfg.templates.home;
	},

	button: function (text, href, primary) {
		var $styles = botoweb.env.cfg.styles;

		var button = $('<button/>')
			.addClass($styles.button + ' bw_button')
			.html(text);

		if (href)
			button.click(function () { document.location = href });

		if (primary !== undefined) {
			if (primary)
				button.addClass($styles.primary);
			else
				button.addClass($styles.secondary);
		}

		return button;
	},

	sortable: function (node) {
		return node.sortable({
			placeholder: 'ui-state-highlight ui-clearfix',
			forcePlaceholderSize: true,
			stop: function() {
				botoweb.ui.sort_icons(node);
			}
		}).disableSelection();
	},

	sort_icons: function(node) {
		if (node.find('li').length > 1) {
			node.find('li span:first-child').attr('className', 'ui-icon ui-sorter ui-icon-arrowthick-2-n-s');
			node.find('li:first > span:first').attr('className', 'ui-icon ui-sorter ui-icon-arrowthick-1-s');
			node.find('li:last > span:first').attr('className', 'ui-icon ui-sorter ui-icon-arrowthick-1-n');
		}
		else {
			node.find('li > span:first').attr('className', 'ui-icon ui-sorter ui-icon-bullet');
		}
	}
};

$('.bw_button')
	.live('mouseover', function () {
		$(this).addClass(botoweb.env.cfg.styles.hover);
	})
	.live('mouseout', function () {
		$(this).removeClass(botoweb.env.cfg.styles.hover)
			.removeClass(botoweb.env.cfg.styles.active);
	})
	.live('mousedown', function () {
		$(this).addClass(botoweb.env.cfg.styles.active);
	})
	.live('mouseup', function () {
		$(this).removeClass(botoweb.env.cfg.styles.active);
	});