const mongoose = require('mongoose');
const _ = require('lodash');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');

//jwt secret
const jwtSecret = "11566772471794423939bcjsbcjsdbcgskduihjdbccdbc9818444338";


//sema korisnika
const UserSchema = new mongoose.Schema({
    email: {
        type: String,
        required: true,
        minlength: 1,
        trim: true,
        unique: true
    },
    password: {
        type: String,
        required: true,
        minlength: 8
    },
    sessions: [
        {
            token: {
                type: String,
                required: true,

            },
            expiresAt: {
                type: Number,
                require: true
            }
        }
    ]


});

//instance methods

//pretvaranje korisnika u json
UserSchema.methods.toJSON = function () {
    const user = this;
    const userObject = user.toObject();

    //return the doc except the password and sessions (ne trebaju biti public)

    return _.omit(userObject, ['password', 'sessions']);
}


//generisanje jwt tokena
UserSchema.methods.generateAccessAuthToken = function () {
    const user = this;
    return new Promise((resolve, reject) => {
        //create JWT and return it

        jwt.sign({ _id: user._id.toHexString() }, jwtSecret, { expiresIn: "60m" }, (err, token) => {
            if (!err) {
                resolve(token);
            } else {
                //is error
                reject();
            }
        })
    });
}

//generisanje refresh tokena
UserSchema.methods.generateRefreshAuthToken = function () {
    return new Promise((resolve, reject) => {
        crypto.randomBytes(64, (err, buf) => {
            if (!err) {
                let token = buf.toString('hex');
                return resolve(token);
            }
        })
    })
}

//kreiranje sesije
UserSchema.methods.createSessions = function () {
    let user = this;
    return user.generateRefreshAuthToken().then((refreshToken) => {
        return saveSessionToDataBase(user, refreshToken);
    }).then((refreshToken) => {
        //saved to db successfully
        //now return the refresh token

        return refreshToken;
    }).catch((e) => {
        return Promise.reject('Failed to save session to database.\n' + e);
    })
}

//pomocna funkcija za cuvanje sesije u bazu
let saveSessionToDataBase = (user, refreshToken) => {
    //save session to db
    return new Promise((resolve, reject) => {
        let expiresAt = generateRefreshTokenExpiryTime();
        user.sessions.push({ 'token': refreshToken, expiresAt });

        user.save().then(() => {
            //saves session successfully
            return resolve(refreshToken);
        }).catch((e) => {
            reject(e);
        });
    })
}

//module methods


//dobijanje jwt tokena
UserSchema.statics.getJWTSecret = () => {
    return jwtSecret;
}

//nalazenje korisnika po id-u i tokenu
UserSchema.statics.findByIdAndToken = function (_id, token) {

    const User = this;

    return User.findOne({
        _id,
        'sessions.token': token
    });
}

//nalazenje korisnika po emailu i lozinki
UserSchema.statics.findByCredentials = function (email, password) {
    let User = this;
    return User.findOne({ email }).then((user) => {
        if (!user) return Promise.reject();

        return new Promise((resolve, reject) => {
            bcrypt.compare(password, user.password, (err, res) => {
                if (res) {
                    resolve(user);
                }
                else {
                    reject();
                }
            })
        })
    })
}

//da li je refresh token istekao
UserSchema.statics.hasRefreshTokenExpired = (expiresAt) => {
    let secondsSinceEpoch = Date.now() / 1000;
    if (expiresAt > secondsSinceEpoch) {
        //hasn't expired
        return false;
    } else {
        //has expired
        return true;
    }
}

//middleware

//izvrsava se prije nego sto se korisnik sacuva u bazu, lozinka se pretvara u hash vrijednost
UserSchema.pre('save', function (next) {
    let user = this;
    let costFaktor = 10;

    if (user.isModified('password')) {
        //if password field has been edited, run this code
        bcrypt.genSalt(costFaktor, (err, salt) => {
            bcrypt.hash(user.password, salt, (err, hash) => {
                user.password = hash;
                next();
            })
        })
    } else {
        next();
    }
})


//helper methods

//generisanje vremena trajanja refresh tokena
let generateRefreshTokenExpiryTime = () => {
    let daysUntilExpire = "100";
    let secondsUntilExpire = ((daysUntilExpire * 24) * 60) * 60;
    return ((Date.now() / 1000) + secondsUntilExpire);
}

const User = mongoose.model('User', UserSchema);
module.exports = { User };