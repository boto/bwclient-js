/**
 * Library of helper functions.
 *
 * @author Ian Paterson
 */

(function ($) {

var $util = botoweb.util;

/**
 * Returns a properly formatted ISO 8601 timestamp string.
 *
 * @param {Date|String} d A JavaScript Date or a string in mm/dd/yyyy hh:mm:ss am
 * format, defaults to current date and time.
 */
$util.timestamp = function (d) {
	if (!d)
		d = new Date();
	else if (typeof d == 'string') {
		//           mm     dd     yyyy     hh    mm       ss     am|pm
		var data = /(\d+)\/(\d+)\/(\d+)(?: (\d+):(\d+)(?::(\d+))? (..))?/.exec(d);

		// String to number (except am|pm)
		for (var i in data) {
			if (i < 7)
				data[i] = (data[i] || 0) * 1;
		}

		// Adjust month to zero-based
		data[1] -= 1;

		// Adjust hours
		if (data[4] == 12)
			data[4] = 0;

		if (data[7].toUpperCase() == 'PM')
			data[4] += 12;

		d = new Date(data[3], data[1], data[2], data[4], data[5], data[6]);
	}

	var timestamp = d.getUTCFullYear() + '-0' + (d.getUTCMonth() + 1) + '-0' + d.getUTCDate() + 'T0';

	// Special case, if the time is exactly midnight, leave it as
	// exactly midnight in GMT. This signifies that the time is not
	// important.
	if (!d.getHours() && !d.getMinutes() && !d.getSeconds())
		timestamp += '00:00:00';
	else
		timestamp += d.getUTCHours() + ':0' + d.getUTCMinutes() + ':0' + d.getUTCSeconds();

	// We added extra zeroes to ensure full two-digit dates, if there
	// are three digits in any space, remove the leading zero.
	return timestamp.replace(/([T:-])0(\d\d)/g, '$1$2');
};

/**
 * Returns a nicely formatted date string in the user's current time zone. If
 * the time component is 00:00:00, the date string will not include the time.
 *
 * @param {String} ts An ISO 8601 timestamp string.
 */
$util.from_timestamp = function (ts) {
	var t = ts.match(/(\d+)-(\d+)-(\d+)T(\d+):(\d+):(\d+)/);

	if (!t || t.length < 7)
		return

	// String to number
	for (var i in t)
		t[i] = t[i] * 1;

	// If the time is exactly midnight, assume that this is a date with unspecified time
	var has_time = (t[4] || t[5] || t[6]);

	if (has_time)
		self.date_time = new Date(Date.UTC(t[1],t[2] - 1,t[3],t[4],t[5],t[6]));

	// We use NOON if there is no time because this prevents seeing a different
	// date after TZ conversion, as would happen if we used MIDNIGHT.
	else
		self.date_time = new Date(Date.UTC(t[1],t[2] - 1,t[3], 12, 0, 0));

	var time_str = '0' + (self.date_time.getMonth() + 1) + '/0' +
		self.date_time.getDate() + '/' + self.date_time.getFullYear();

	if (has_time) {
		time_str += ' 0' + (self.date_time.getHours() % 12 || 12) + ':0' + self.date_time.getMinutes() + ' ' +
			((self.date_time.getHours() < 12 || self.date_time.getHours() == 0) ? 'AM' : 'PM');
	}

	return time_str.replace(/(^|[ \/:])0(\d\d)/g, '$1$2');
};

/**
 * Joins any number of URL parts into a single URL. Preserves leading and
 * trailing slashes on the first and last items, respectively.
 */
$util.url_join = function () {
	return $.map(arguments, function (part, i) {
		if (!part)
			return null;

		if (i > 0)
			part = part.replace(/^\/+/g, '');

		if (i < arguments.length - 1)
			part = part.replace(/\/+$/g, '');

		return escape(part).replace('%3A//', '://');
	}).join('/');
};

/**
 * Interpolates variables offset in strings by {{ var_name }} notation.
 *
 * @param {String} str The string containing interpolation markup.
 * @param {Object} data The data available for interpolation.
 * @return The interpolated string.
 */
$util.interpolate = function (str, data) {
	if (!str) return str;
	if (!data) data = {};

	return str.replace(/\{\{\s*(\w+)\s*\}\}/g, function (m, key) {
		return data[key] || '';
	});
};

/**
 * Returns the string with all HTML entities replaced with their
 * corresponding characters. This will convert entities such as &lt; as
 * well as &#39;
 *
 * @param {String} str The string to unescape.
 * @return The unescaped string.
 */
$util.html_unescape = function (str) {
	if (str)
		return $('<div/>').html(str || '').text();

	return '';
};

$util.log = function (msg, err_type) {
	if (!msg)
		return;

	// Support use in catching errors
	if (msg.message)
		msg = msg.message;

	err_type = err_type || 'm';

	switch (err_type.charAt(0)) {
		case 'e':
			msg = '[BW ERROR] ' + msg;
			break;
		case 'w':
			msg = '[BW  WARN] ' + msg;
			break;
		default:
			msg = '[BW  MESG] ' + msg;
	}

	try {
		console.log(msg);
	} catch (e) {
		alert(msg);
	}
};

$util.error = function (msg) {
	botoweb.util.log(msg, 'e');
};

$util.warn = function (msg) {
	botoweb.util.log(msg, 'w');
};

})(jQuery);