const express = require("express");
const cookieParser = require('cookie-parser')
const { createServer } = require("http");
const { Server } = require("socket.io");
const fs = require('fs')

const app = express();
app.use(express.static('static'));

// Serve the public/ folder too so the client files we added (public/js/voice.owl.js, etc.) are reachable.
// Option: alternatively move the files into static/js instead of adding this line.
app.use(express.static('public'));

app.use(cookieParser())
const httpServer = createServer(app);
app.use(express.urlencoded({ extended: false }))
app.use(express.json())
const io = new Server(httpServer, { /* options */ });

// Attach the voice signaling helper we added (server/voice-signaling.owl.js).
// If you use a different namespace for your game sockets, change namespace: '/game' accordingly.
const attachVoiceSignaling = require('./server/voice-signaling.owl.js');
attachVoiceSignaling(io, { namespace: '/' });

let users = []
let cards = []
let hasStarted = []
let emitUsers
let hasFinished = []
let allLengths = []

fs.readFile(__dirname + '/cards.json', 'utf-8', (err, data)=>{
    if(err){
        console.log(err)
    }else{
       try{
        const jsonData = JSON.parse(data)
        cards = jsonData.cards
        // console.log(cards)
       }catch (parseError){
        console.log(parseError)
       }
    }
})


io.on('connection', (socket, cb)=>{
    socket.on('joinRoom', (userDetails, cb) => {
        // console.log(userDetails)
        // console.log(checkRoomExists(roomName))
        socket.join(userDetails.roomName)
        users.push({
            user: socket.id,
            room: userDetails.roomName,
            userName: userDetails.name,
            userId: userDetails.userId,
            finished: false
        })
        const newName = users.find(el => el.user == socket.id)
        emitUsers = {
            joinAction: 'joined',
            concern:  newName,
            users: users
        }
        io.to(userDetails.roomName).emit('users', emitUsers)
        socket.on('change-turn', (turn)=>{
            console.log(turn)
            io.to(turn.roomName).emit('next-turn', turn)
        })

        socket.on('last-card', (details)=>{
            io.to(details.room).emit('lastCard', details)
        })

        socket.on('disconnect', () =>{
            // console.log('user disconnected', socket.id)
            const newName = users.find(el => el.user == socket.id)
            users = users.filter(function(el){return el.user != socket.id})
            emitUsers = {
                joinAction: 'left',
                concern: newName,
                users: users
            }
            // console.log(users)
            io.to(userDetails.roomName).emit('users', emitUsers)
        })

        socket.on('i-finished', (user)=>{
            const finishedUser = users.find(el => el.userId == user.userId)
            // console.log(finishedUser)
            finishedUser.finished = true
            users[users.indexOf(finishedUser)].finished = true
            hasFinished.push(finishedUser)
            // console.log('686', hasFinished)
            // console.log('user finish', users)
            const newName = users.find(el => el.user == socket.id)
            emitUsers = {
                joinAction: 'finished',
                concern: newName,
                users: users
            }
            io.to(userDetails.roomName).emit('user-finished', emitUsers)
        })

        socket.on('last-one', (user)=>{
            hasFinished.push(user)
            console.log('finn2', hasFinished)
        })
        socket.on('last-pile', (roomName)=>{
            console.log('last-pile', roomName)
            io.to(roomName).emit('last-pile', 'last')
        })
        socket.on('my-length', (data)=>{
            // console.log(data)
            const myData = {
                user: socket.id,
                room: data.roomName,
                userName: data.name,
                userId: data.userId,
                finished: false,
                length: data.cardLength
            }
            allLengths.push(myData)
            allLengths.sort((a, b) => a.length - b.length)
            hasFinished = allLengths
            // console.log(allLengths)
            io.to(data.roomName).emit('game-end', 'end')
        })
        io.to(userDetails.roomName).emit('results', hasFinished)
        // console.log(users)
    })
    socket.on('startGame', (roomName)=>{
        hasStarted.push(roomName)
        hasFinished = hasFinished.filter((el)=> {return el.room != roomName})
        console.log(hasStarted)
        cards = cards.sort(() => Math.random() - 0.5)
        io.to(roomName).emit('shuffle', cards)
    })
    socket.on('endGame', (roomName)=>{
        console.log('endGame', roomName)
       hasStarted =  hasStarted.filter(function(el){return el != roomName})
       io.to(roomName).emit('ended', 'endGame')
    })
    io.emit('hasStarted', hasStarted)
    io.emit('userLength', users)
    socket.on('reset', (roomId)=>{
        hasStarted =  hasStarted.filter(function(el){return el != roomId})
        hasFinished = hasFinished.filter((el)=> {return el.room != roomId})
        const roomIdLong = Date.now();
        const newRoomId = roomIdLong.toString().split(""").splice(6, 5).join("");
        io.to(roomId).emit('restart', newRoomId)
    })
})


app.get('/', (req, res) => {
    res.sendFile(__dirname + '/static/auth.html')
    const cookie = req.cookies['roomId']
})

app.get('/getrooms', (req, res)=>{
    let allRooms = []
    // console.log(users)
    if(users.length == 0){
        allRooms = []
    }else{
        users.forEach(user => {
            allRooms.push(user.room)
        })
    }
    // console.log(allRooms)
    res.json(allRooms)
})

app.post('/joinroom', (req, res)=>{
    const body = req.body
    // console.log(body)
    res.cookie('roomId', body.room)
    res.cookie('userId', body.userId)
    res.cookie('userName', body.name)
    res.redirect('/room')
})


app.get('/room', (req, res)=>{
    res.sendFile(__dirname + '/static/room.html')
    const rooms = Array.from(io.sockets.adapter.rooms.keys());
    // console.log('rooms', rooms) 
})

app.get('/ended', (req, res)=>{
    res.clearCookie('roomId')
    res.sendFile(__dirname + '/static/ended.html')
})

app.get('/results', (req, res)=>{
    res.sendFile(__dirname + '/static/results.html')
})

app.get('/restart/:id', (req, res)=>{
    const id = req.params.id
     res.cookie("roomId", id);
     res.redirect('/room')
})

app.get('/joinroom/:id', (req, res)=>{
    //  const id = req.params.id;
     res.sendFile(__dirname + "/static/name.html");
})

const PORT = process.env.PORT || 4000;
httpServer.listen(PORT, () => console.log(`Server running on port ${PORT}`));