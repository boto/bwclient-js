/**
 * SocketIO connection
 * Similar to ajax.js, but connects with socketio,
 * thus only returns data, not an XHR item
 *
 * @author Chris Moyer
 */

botoweb.conn = {
	_conn: null,
	connected: false,

	// Callbacks listening for specific messages
	_callbacks: {},

	/*
	 * Initialization function
	 */
	init: function(hn){
		if(!hn){
			hn = ':8443';
		}
		var $conn = io.connect(hn);
		$conn.on('data', botoweb.conn.data);
		$conn.on('err', botoweb.conn.err);
		$conn.on('error', botoweb.conn.err);
		$conn.on('disconnect', botoweb.conn.disconnect);
		$conn.on('connect', botoweb.conn.connect);
		botoweb.conn._conn = $conn;
	},

	/*
	 * Called on successful connections
	 */
	connect: function(){
		console.log('Connected');
		botoweb.conn.connected = true;
	},

	/*
	 * Called when we've received a disconnected packet
	 */
	disconnect: function(){
		console.log('Disconnected');
		botoweb.conn.connected = false;
	},

	/*
	 * Called when there is an error
	 */
	err: function(e){
		console.error(e);
	},

	/*
	 * Called when any data is received
	 */
	data: function(msg){
		console.log(msg);
		if(botoweb.conn._callbacks[msg.msg_id]){
			botoweb.conn._callbacks[msg.msg_id](msg.msg);
		}
	},

	/*
	 * Standard REST commands
	 */
	request: function(method, args, callback){
		var msg_id = new Date().getTime();
		if(typeof args == 'string'){
			args = { model: args };
		}
		args.msg_id = msg_id;
		botoweb.conn._callbacks[msg_id] = callback;
		return botoweb.conn._conn.emit(method, args);
	},
	get: function(args, callback){
		return botoweb.conn.request('GET', args, callback);
	},
	post: function(args, callback){
		return botoweb.conn.request('POST', args, callback);
	},
	put: function(args, callback){
		return botoweb.conn.request('PUT', args, callback);
	},
	delete: function(args, callback){
		return botoweb.conn.request('DELETE', args, callback);
	}

}
