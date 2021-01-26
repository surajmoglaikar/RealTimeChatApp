const path = require('path');
const http = require('http');
const express = require('express');
const socketio = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt-nodejs');
const formatMessage = require('./utils/messages');
const redis = require('redis');
const amqp = require('amqp');

users = {};

var rabbitConn = amqp.createConnection({host:'localhost',login:'guest',password:'guest'});
var current;
rabbitConn.on('ready', function(){
current = rabbitConn.exchange('current', {'type': 'fanout'});
});
mongoose.connect('mongodb://localhost/chat',{useNewUrlParser:true,useUnifiedTopology:true},function(err){
    if(err){
        console.log(err);
    }else{
        console.log('connected to mongodb');
    }
	});

	
	    var chatSchema = mongoose.Schema({
    	users: { username: String, password: String },
    	created: {type: Date, default: Date.now}
	});

	chatSchema.methods.generateHash = function(password) {
		return bcrypt.hashSync(password, bcrypt.genSaltSync(8), null);
    };
    
    // checking if password is valid
	  chatSchema.methods.validPassword = function(password) {
      return bcrypt.compareSync(password, this.password);
      };
  
     var chat = mongoose.model('message', chatSchema);

const {
  userJoin,
  getCurrentUser,
  userLeave,
  getRoomUsers
} = require('./utils/users');

const app = express();
const server = http.createServer(app);
const io = socketio(server);

// Set static folder
app.use(express.static(path.join(__dirname, 'public')));

const UName = 'Chatapp';

console.log('connected to redis');
function SessionController (user) {

	this.sub = redis.createClient();
	this.pub = redis.createClient();
	
	this.user = user;
}

SessionController.prototype.subscribe = function(socket) {
	this.sub.on('message', function(data, userDetails) {
    
		socket.emit(userDetails);
	});
  var current = this;
	this.sub.on('subscribe', function(data) {
    var joinMessage = JSON.stringify({action: 'control', user:current.user.username, msg: formatMessage(UName, `${current.user.username} has joined the chat`) });
    socket.emit('message', joinMessage);
   

  // Broadcast when a user connects
  socket.broadcast
    .to(current.user.room)
    .emit(
      'message',
      joinMessage
    );
		current.publish(joinMessage);
	});
	this.sub.subscribe('chat');
};

SessionController.prototype.unsubscribe = function() {
	this.sub.unsubscribe('chat');
};

SessionController.prototype.publish = function(message) {
 // console.log('on publish isisis:', message);
	this.pub.publish('chat', message);
};

SessionController.prototype.destroyRedis = function() {
	if (this.sub !== null) this.sub.quit();
	if (this.pub !== null) this.pub.quit();
};

// Run when client connects
io.on('connection', socket => {
  
socket.on('joinRoom', ({ username, room }) => {
  
  const user = userJoin(socket.id,username, room );
  
  socket.sessionController = new SessionController(user);
  socket.sessionController.subscribe(socket);

  socket.join(user.room);
  
   socket.emit('message', formatMessage(UName, 'Welcome to ChatApp!'));


  // Send users and room info
  io.to(user.room).emit('roomUsers', {
    room: user.room,
    users: getRoomUsers(user.room)
  });
}); 

rabbitConn.queue('', {exclusive: true}, function (q) {
			
  //Bind to chatExchange w/ "#" or "" binding key to listen to all messages.
  q.bind('current', "");


  socket.on('chat', msg => {
  const user = getCurrentUser(socket.id);
  if (socket.sessionController === null) {
              socket.sessionController = new SessionController(user);
              socket.sessionController.rejoin(socket, msg);
            } else {
              
                 var newMsg = new chat({users: {username:user.username}});
                 newMsg.users.password = newMsg.generateHash(msg.password);
                 newMsg.save(function(err){
                  if(err) throw err;
               io.to(user.room).emit('message', formatMessage(user.username, msg)); 
             });
            
              //socket.sessionController.publish(msg);
              //q.subscribe(function (msg) {
               //socket.emit('chat', JSON.stringify(msg));
             // })
              socket.sessionController.publish(msg);
            }
          
  socket.on('disconnect', () => {
    if (socket.sessionController === null) return;
    const user = socket.sessionController.user;

	 var leaveMessage = JSON.stringify({action: 'control', user: socket.sessionController.user.username, msg: formatMessage(UName, `${user.username} has left the chat`) });
	
    if (user) {
      io.to(user.room).emit(
        'message',
        leaveMessage
      );

      io.to(user.room).emit('roomUsers', {
        room: user.room,
        users: getRoomUsers(user.room)
      });
        }
    socket.sessionController.publish(leaveMessage);
		socket.sessionController.destroyRedis();
      });
     });
    });
  })
const PORT = process.env.PORT || 3000;

server.listen(PORT, () => console.log(`Server running on port ${PORT}`));
