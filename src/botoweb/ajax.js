/**
 * Works with ajaxManager to queue and cache AJAX requests to allow more control
 * over active and pending AJAX.
 *
 * @author Chris Moyer
 */
botoweb.ajax = {
	cachedRequests: {},
	manager: $.manageAjax.create('cacheQueue', { queue: true, cacheResponse:false, preventDoubbleRequests: false, maxRequests: 3 }),
	stop: function(name, id){
		botoweb.ajax.cachedRequests = {};
		botoweb.ajax.manager.abort(name, id);
	},
	stop_all: function(){
		botoweb.ajax.cachedRequests = {};
		botoweb.ajax.manager.abort('cacheQueue');
	},
	stop_by_url: function(url){
		var ajaxID = 'GET_'+ url.replace(/\./g, '_');
		botoweb.ajax.cachedRequests = {};
		botoweb.ajax.manager.abort(null, ajaxID);
	},
	get: function(url, callback, error){
		var ajaxID = 'GET_'+ url.replace(/\./g, '_');
		var cachedRequests = botoweb.ajax.cachedRequests;
		if(cachedRequests[ajaxID]){
			cachedRequests[ajaxID].push(callback);
		} else {
			cachedRequests[ajaxID] = [callback];

			var count_404 = 0;

			var cfg = {
				success: function(data, status, xhr){
					for(cbnum in cachedRequests[ajaxID]){
						cachedRequests[ajaxID][cbnum](data, xhr);
					}
					delete cachedRequests[ajaxID];
				},
				error: function(data) {
					if (data.status >= 400)
						console.error('HTTP ERROR: ' + data.status + ' ' + data.statusText + '\n' + url + '\n', data);

					if (data.status == 408) {
						setTimeout(function() {
							botoweb.ajax.manager.add(cfg);
						}, 250);
					}
					else if (data.status == 404) {
						if (count_404 >= 3) {
							// Send error as 2nd argument to avoid confusing it
							// with the obj XML
							if (error)
								error(null, data);
							return;
						}

						setTimeout(function() {
							botoweb.ajax.manager.add(cfg);
						}, 1000 + count_404 * 1000);

						count_404++;
					}
					else if (error) {
						delete cachedRequests[ajaxID];
						// Send error as 2nd argument to avoid confusing it
						// with the obj XML
						error(null, data);
					}
				},
				url: url
			};

			botoweb.ajax.manager.add(cfg);
		}
	}
};