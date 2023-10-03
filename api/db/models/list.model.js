const mongoose = require('mongoose');

//sema liste
const ListSchema = new mongoose.Schema({
    //definisemo 2 polja za listu
    title: {
        type: String,
        required: true,
        minlength: 1,
        trim: true
    },
    _userId: {
        type: mongoose.Types.ObjectId,
        required: true
    }
})

const List = mongoose.model('List', ListSchema);

module.exports = { List };