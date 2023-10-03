const express = require('express');
const cors = require('cors');

const app = express();


const { mongoose } = require('./db/mongoose');
const bodyParser = require('body-parser');

//load in mongoose models
const { List, Task, User } = require('./db/models');


const jwt = require('jsonwebtoken');


//MIDDLEWARE

//load middleware
app.use(bodyParser.json());


app.use(function (req, res, next) {
    res.header("Access-Control-Allow-Origin", "*");
    res.header("Access-Control-Allow-Methods", "GET, POST, HEAD, OPTIONS, PUT, PATCH, DELETE");
    res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept, x-access-token, x-refresh-token, _id");

    res.header(
        'Access-Control-Expose-Headers',
        'x-access-token, x-refresh-token'
    );
    next();
});

app.use(cors());

app.options('*', cors());


//check weather the req has a valid JWT token
let authenticate = (req, res, next) => {
    let token = req.header('x-access-token');

    //verify JWT

    jwt.verify(token, User.getJWTSecret(), (err, decoded) => {
        if (err) {
            //there was an error
            //jwt is invalid, do not autenticate
            res.status(401).send(err);
        } else {
            //jwt is valid
            req.user_id = decoded._id;
            next();
        }
    });
}


//verify refreshToken middleware - which will be verifying session

let verifySession = (req, res, next) => {
    //grab refreshToken from header
    let refreshToken = req.header('x-refresh-token');

    //grab id from header
    let _id = req.header('_id');

    User.findByIdAndToken(_id, refreshToken).then((user) => {
        if (!user) {
            //user couldn't be found
            return Promise.reject({
                'error': 'User not found. Make sure that refresh token and user id are correct'
            });
        }

        //if the code reches here - the user was found
        //therefore the refresh token exists in database - but we still have to check if it has expires or not

        req.user_id = user._id;
        req.userObject = user;
        req.refreshToken = refreshToken;

        let isSessionValid = false;

        user.sessions.forEach((session) => {
            if (session.token === refreshToken) {
                //check if the session has expired
                if (User.hasRefreshTokenExpired(session.expiresAt === false)) {
                    //refresh token has not expired
                    isSessionValid = true;
                }
            }
        });

        if (isSessionValid) {
            //te session is VALID, call next() to continue proccessing this web request
            next();
        } else {
            //session is not valid
            return Promise.reject({
                'error': 'Refresh token has expired or the session is invalid'
            })
        }

    }).catch((e) => {
        res.status(401).send(e);
    })
}

// END MIDDLEWARE

//route handlers

//list handlers
// GET /lists
//purpose: get all lists
app.get('/lists', authenticate, (req, res) => {
    //we want to return an array of all the lists that belong to the authenticated user
    List.find({
        _userId: req.user_id
    }).then((lists) => {
        res.send(lists);
    });
});

app.get('/lists', authenticate, (req, res) => {
    res.send('This is the base /lists route');
});

//POST /lists
//purpose: create list
app.post('/lists', authenticate, (req, res) => {
    //we want to create a new list and return the new list document back to the user (which includes id)
    //list infomation (fileds) will be passed by JSON request body
    let title = req.body.title;

    let newList = new List({
        title,
        _userId: req.user_id
    });
    newList.save().then((listDoc) => {
        //the full list document is returned 
        res.send(listDoc);
    });
});

//PURPOSE: TO UPDATE SPECIFIED LISTE
app.patch('/lists/:id', authenticate, (req, res) => {
    //we want to update the specified list with the new values specified in JSON

    List.findOneAndUpdate({ _id: req.params.id, _userId: req.user_id }, {
        $set: req.body
    }).then(() => {
        res.send({ message: 'Updated successfully' });
    });
});

//DELETE LIST
app.delete('/lists/:id', authenticate, (req, res) => {
    //we want to delete the specified list 
    List.findOneAndRemove({
        _id: req.params.id,
        _userId: req.user_id
    }).then((removedListDoc) => {
        res.send(removedListDoc);

        //delete all the tasks that are in the deleted list
        deleteTasksFromList(removedListDoc._id);
    });
});

//GET ALL TASKS IN SPECIFIC LIST
app.get('/lists/:listId/tasks', authenticate, (req, res) => {
    //we want to return all tasks that belong to specific list
    Task.find({
        _listId: req.params.listId
    }).then((tasks) => {
        res.send(tasks);
    })
});

//MAKE TASK
app.post('/lists/:listId/tasks', authenticate, (req, res) => {
    //we want to create a new task in a list specified by listId

    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((list) => {
        if (list) {
            //list object is valid
            //therefore the currently auth user can create new tasks
            return true;
        }
        //the list object is undefined
        return false;
    }).then((canCreateTask) => {
        if (canCreateTask) {
            let newTask = new Task({
                title: req.body.title,
                _listId: req.params.listId
            });

            newTask.save().then((newTaskDoc) => {
                res.send(newTaskDoc);
            })
        } else {
            res.sendStatus(404);
        }
    })



});

//UPDATE TASK
app.patch('/lists/:listId/tasks/:taskId', authenticate, (req, res) => {
    //we want to update task specified by taskId

    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((list) => {
        if (list) {
            //list object is valid
            //therefore the currently auth user can update the task
            return true;
        }
        return false;
    }).then((canUpdateTasks) => {
        if (canUpdateTasks) {
            //the currently auth user can update tasks
            Task.findOneAndUpdate({
                _id: req.params.taskId,
                _listId: req.params.listId
            }, {
                $set: req.body
            }
            ).then(() => {
                res.send({ message: 'Updated successfully.' });
            });
        } else {
            res.sendStatus(404);
        }
    })

});

//DELETE TASK
app.delete('/lists/:listId/tasks/:taskId', authenticate, (req, res) => {
    //we want to delete the specified tasklist 

    List.findOne({
        _id: req.params.listId,
        _userId: req.user_id
    }).then((list) => {
        if (list) {
            //list object is valid
            //therefore the currently auth user can update the task
            return true;
        }
        return false;
    }).then((canDeleteTasks) => {

        if (canDeleteTasks) {

            Task.findOneAndRemove({
                _id: req.params.taskId,
                _listId: req.params.listId
            }).then((removedTaskDoc) => {
                res.send(removedTaskDoc);
            });
        } else {
            res.sendStatus(404);
        }
    });
});


//USER ROUTES

// POST /users
//Purpose: sign up
app.post('/users', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Check if the email already exists
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).send({ error: 'Email already exists' });
        }

        const newUser = new User({ email, password });

        // Save user and create sessions
        await newUser.save();
        const refreshToken = await newUser.createSessions();
        const accessToken = await newUser.generateAccessAuthToken();

        res
            .header('x-refresh-token', refreshToken)
            .header('x-access-token', accessToken)
            .send(newUser);
    } catch (e) {
        console.error('Signup error:', e);
        res.status(400).send({ error: 'Signup failed' });
    }
});


//POST /users/login
//pURPOSE: LOG IN

app.post('/users/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        // Find user by email and validate credentials
        const user = await User.findByCredentials(email, password);

        // Create a session, generate access token, and return tokens
        const refreshToken = await user.createSessions();
        const accessToken = await user.generateAccessAuthToken();

        res
            .header('x-refresh-token', refreshToken)
            .header('x-access-token', accessToken)
            .send(user);
    } catch (e) {
        console.error('Login error:', e);
        res.status(400).send({ error: 'Invalid credentials' });
    }
});


// GET /users/me/access-token
//Purpose: generate and return access-token

app.get('/users/me/access-token', verifySession, (req, res) => {
    req.userObject.generateAccessAuthToken().then((accessToken) => {
        res.header('x-access-token', accessToken).send({ accessToken });
    }).catch((e) => {
        res.status(400).send(e);
    });
})

//HELPER METHODS

let deleteTasksFromList = (_listId) => {
    Task.deleteMany({
        _listId
    }).then(() => {
        console.log("Tasks from " + _listId + "are deleted");
    })
}

app.use((req, res) => {
    res.status(404).send("404 - Not Found");
});

app.listen(3000, () => {
    console.log("Server is listening on port 3000");
});