// Setup code
// ------------------------------------------------------------------------------
var express = require('express');
var app = express();
app.set('port', process.env.PORT || 3000);

var handlebars = require('express-handlebars');
app.engine('handlebars', handlebars({
    defaultLayout: 'main'
}));
app.set('view engine', 'handlebars');

// require body-parser module
var bodyParser = require('body-parser');
app.use(bodyParser.urlencoded({ extended: true }));

// required the filesystem module @martin
var fs = require('fs');
// require jimp for generating thumbnails @martin
var jimp = require("jimp");

// require formidable for handling audio/video uploads
var formidable = require("formidable");

// use express-session to create in-memory sessions @martin
var session = require('express-session');
app.use(session({
    resave: false,
    saveUninitialized: false,
    secret: "teamJAHM"
}));

// require the JavaScript to process image uploads from Froala @jingyuan
var upload_image = require("./image_upload.js");
var FroalaEditor = require("./wysiwyg-editor-node-sdk/lib/froalaEditor.js");

// allow us to use SQLite3 from node.js & connect to a database @martin
var sqlite3 = require('sqlite3').verbose();

//import external DAO module which contains database statements
var dao = require('./dao.js');

// require sha1 for generating random file names
var sha1 = require("sha1");

// Code for authentication starts from here @martin
// ---------------------------------------------------------------------------------

// require the 'passport' module for authentication
var passport = require('passport');
// use the local authentication strategy
var LocalStrategy = require('passport-local').Strategy;

// define the local authentication strategy
var localStrategy = new LocalStrategy(function (username, password, done) {

    // query the blog database for the supplied username and retrieve all columns
    dao.getUser(username, function (user) {
        // there should only be 1 row returned by SQL query if an active username was found
        if (!user) {
            return done(null, false, {
                message: 'Invalid user'
            });
        };

        // if the provided password, does not match what is in the database
        if (user.password !== password) {
            return done(null, false, {
                message: 'Invalid password'
            });
        };

        // if the above validation has passed, then user is authenticated
        done(null, user);
    });

});

// method to be called to save the currently logged in username to the session
passport.serializeUser(function (user, done) {
    done(null, user.username);
});

// method to be called to retrieve all data in the database related to the provided username
passport.deserializeUser(function (username, done) {

    // query the blog database for the supplied username
    dao.getUser(username, function (user) {
        done(null, user);
    });

});

// passport should use the 'local strategy' for authentication
passport.use('local', localStrategy);

// initialise passport
app.use(passport.initialize());
// request passport to use sessions to store its data
app.use(passport.session());

// ---------------------------------------------------------------------------------
// code for authentication ends @martin


// check if user is logged in
function isLoggedIn(req, res, next) {
    // if user is authenticated, execute the next function 
    if (req.isAuthenticated()) {
        return next();
    }

    // redirect them to the login page
    res.redirect("/login");
}

//--------------------- ROUTE HANDLERS -------------------------------------------

//-----Routes for displaying and editing ARTICLES-------------------------------
app.get(['/', '/home', '/article'], function (req, res) {

    var username = null;
    var avatar = null;

    if (req.isAuthenticated()) {
        username = req.user.username;
    }

    // query user table to get user Avatar in nav-bar then query Articles table to get all articles to be displayed @alan
    dao.getUser(username, function (user) {
        dao.getAllArticles(function (articles) {

            if (user != null) {
                avatar = user.avatar;
            }

            var sidebarLinks = [];
            for (var i = 0; i < 5; i++) {
                sidebarLinks[sidebarLinks.length] = articles[i];
            }

            var data = {
                username: username,
                avatar: avatar,
                articles: articles,
                sidebarLinks: sidebarLinks,
                loggedOut: req.query.loggedOut,
                newArticleCreated: req.query.newArticleCreated,
                accountUpdated: req.query.accountUpdated,
                articleDeleted: req.query.articleDeleted,
                userDeleted: req.query.userDeleted,
                allArticles: true
            }

            res.render('home', data);
        });
    });

});

app.get('/addPost', isLoggedIn, function (req, res) {

    var username = req.user.username;
    var avatar = null;

    dao.getUser(username, function (user) {

        avatar = user.avatar;

        var data = {
            username: username,
            avatar: avatar,
            layout: 'no-nav',
        }

        res.render('addPost', data);
    });


});

app.post('/addPost', function (req, res) {

    // create a new formidable form object
    var form = new formidable.IncomingForm();

    // check if any new images require thumbnails
    checkForImages();

    // generates random string used to ensure unique filename
    var randomName = sha1(new Date().getTime());

    // when file upload detected, upload file to the multimedia folder
    form.on("fileBegin", function (name, file) {
        if (file.name != '') {
            file.path = __dirname + "/public/uploads/multimedia/" + randomName + "-" + file.name;
        }
    });

    // parse the submitted form data using formidable
    form.parse(req, function (err, fields, files) {

        // check the file type of the upload file
        var fileType = files.fileUpload.type;
        var newAudio = null;
        var newVideo = null;

        // if file type starts with '/audio'
        if (fileType.startsWith('audio')) {
            newAudio = randomName + "-" + files.fileUpload.name;
            // else if file type starts with '/video'
        } else if (fileType.startsWith('video')) {
            newVideo = randomName + "-" + files.fileUpload.name;
        }

        var articleDetails = {
            username: req.user.username,
            title: fields.title,
            content: fields.content,
            audio: newAudio,
            video: newVideo,
            link: 'no_link'
        }

        dao.createArticle(articleDetails, function (articleId) {

            res.redirect("/home?newArticleCreated=true");
        })
    });

});

app.get('/article/:id', function (req, res) {

    var isArticleAuthor = false;

    var username = null;
    var avatar = null;

    if (req.isAuthenticated()) {
        username = req.user.username;
    }

    dao.getUser(username, function (user) {
        dao.getArticle(req.params.id, function (article, comments) {

            if (user != null) {
                avatar = user.avatar;
            }

            // determine if the logged in user is also the author of the article @alan
            if (article.author == username) {
                isArticleAuthor = true;
                //also allow Article Author to delete comments on the article
                for (var j = 0; j < comments.length; j++) {
                    comments[j].isArticleAuthor = true;
                }
            }

            // add isCommentAuthor flag which enables display of edit and delete button on own comments
            for (var i = 0; i < comments.length; i++) {
                if (comments[i].author == username) {
                    comments[i].isCommentAuthor = true;
                }
            }

            var data = {
                username: username,
                avatar: avatar,
                articles: article,
                allArticles: false,
                isArticleAuthor: isArticleAuthor,
                comments: comments,
                commentDeleted: req.query.commentDeleted
            }

            res.render('articleView', data);
        });
    });
});

app.post('/editPost', function (req, res) {

    var articleId = req.body.articleId;

    dao.getArticle(articleId, function (article) {
        var username = null;
        if (req.isAuthenticated()) {
            username = req.user.username;
        }

        var data = {
            layout: 'no-nav',
            username: username,
            articles: article,
            audio: article.audio,
            video: article.video,
            allArticles: false,
        }

        res.render('editPost', data);
    });
})

app.post('/saveEditedPost', function (req, res) {

    // create a new formidable form object
    var form = new formidable.IncomingForm();

    // check if any new images require thumbnails
    checkForImages();

    // generates random string used to ensure unique filename
    var randomName = sha1(new Date().getTime());

    // when file upload detected, upload file to the multimedia folder
    form.on("fileBegin", function (name, file) {
        if (file.name != '') {
            file.path = __dirname + "/public/uploads/multimedia/" + randomName + "-" + file.name;
        }
    });

    // parse the submitted form data using formidable
    form.parse(req, function (err, fields, files) {

        // check the file type of the upload file
        var fileType = files.fileUpload.type;

        var articleId = fields.articleId;
        var newTitle = fields.title;
        var newContent = fields.content;
        var newAudio = null;
        var newVideo = null;

        // if file type starts with '/audio'
        if (fileType.startsWith('audio')) {
            newAudio = randomName + "-" + files.fileUpload.name;
            // else if file type starts with '/video'
        } else if (fileType.startsWith('video')) {
            newVideo = randomName + "-" + files.fileUpload.name;
        }

        dao.updateArticle(articleId, newTitle, newContent, newAudio, newVideo, function () {
            res.redirect("/article/" + articleId);
        });
    });

});

app.post('/deletePost', function (req, res) {

    var articleId = req.body.articleId;
    var fromAccountPage = req.body.fromAccountPage;

    dao.deleteArticle(articleId, function () {
        if (fromAccountPage) {
            res.redirect("/accountAndPosts?articleDeleted=true")
        } else {
            res.redirect("/home?articleDeleted=true");
        }
    })

})

//------------------------------------------------------------------------------

//-----Routes for displaying and editing COMMENTS-------------------------------

app.post('/addComment', function (req, res) {

    var username = req.body.username;
    var articleId = req.body.articleId;
    var newComment = req.body.newComment;

    dao.addComment(username, articleId, newComment, function () {
        res.redirect("/article/" + articleId);
    });
});

app.post('/editComment', function (req, res) {

    var commentId = req.body.commentId;

    dao.getComment(commentId, function (comment) {
        var username = null;
        if (req.isAuthenticated()) {
            username = req.user.username;
        }

        var data = {
            layout: 'no-nav',
            username: username,
            comment: comment
        }

        res.render('editComment', data);
    });
})

app.post('/saveEditedComment', function (req, res) {

    var commentId = req.body.commentId;
    var articleId = req.body.articleId;
    var newComment = req.body.content;

    dao.updateComment(commentId, newComment, function () {
        res.redirect("/article/" + articleId);

    })

});

app.post('/deleteComment', function (req, res) {

    var commentId = req.body.commentId;
    var articleId = req.body.articleId;
    var fromAccountPage = req.body.fromAccountPage;

    dao.deleteComment(commentId, function () {
        if (fromAccountPage) {
            res.redirect("/accountAndPosts?commentDeleted=true")
        } else {
            res.redirect("/article/" + articleId + "?commentDeleted=true");
        }

    });

});

//------------------------------------------------------------------------------

//-----Routes for USER Activities-----------------------------------------------

app.get('/signup', function (req, res) {

    // generate an array of the additional avatar files (2.png - 12.png)
    var defaultAvatars = ['2.png', '3.png', '4.png', '5.png', '6.png', '7.png', '8.png', '9.png', '10.png', '11.png', '12.png'];

    var data = {
        layout: 'no-nav',
        passwordFail: req.query.passwordFail,
        userData: req.session.partialUserData,
        defaultAvatars: defaultAvatars,
        usernameExists: req.query.usernameExists
    }
    res.render('signup', data);
});

app.post('/signup', function (req, res) {

    // create a new formidable form object
    var form = new formidable.IncomingForm();

    // generates random string used to ensure unique filename
    var randomName = sha1(new Date().getTime());
    // used to determing if user has uploaded an avatar file or not
    var customAvatarFilename = null;

    // when file upload detected, upload file to the avatars folder
    form.on("fileBegin", function (name, file) {

        // if the filename is not empty
        if (file.name != '') {

            customAvatarFilename = randomName + file.name;
            file.path = __dirname + "/public/user-avatars-fullsize/" + customAvatarFilename;
        }
    });

    // generate resized avatar when the file has been written to disk
    form.on("end", function () {
        if (customAvatarFilename != null) {
            var avatarFullPath = __dirname + "/public/user-avatars-fullsize/" + customAvatarFilename;
            var avatarThumbPath = __dirname + "/public/default-avatars/" + customAvatarFilename;
            generateAvatars(avatarFullPath, avatarThumbPath);
        }
    });

    form.parse(req, function (err, fields, files) {

        if (fields.password != fields.passwordCheck) {
            req.session.partialUserData = {
                fname: fields.fname,
                lname: fields.lname,
                dob: fields.dob,
                country: fields.country,
                username: fields.username,
                description: fields.description
            }
            res.redirect('/signup?passwordFail=true');
        }
        else {

            if (customAvatarFilename != null) {
                fields.avatar = customAvatarFilename;
            }

            dao.createUser(fields, function (err, user) {
                if (err) {
                    req.session.partialUserData = {
                        fname: fields.fname,
                        lname: fields.lname,
                        dob: fields.dob,
                        country: fields.country,
                        username: fields.username,
                        description: fields.description
                    }
                    res.redirect('/signup?usernameExists=true');
                }
                else {
                    delete req.session.partialUserData;

                    // pass on username and password values to req.body which passport uses to authenticate the user - this will automatically log the user into the site after signing up
                    req.body.username = user.username;
                    req.body.password = user.password;
                    passport.authenticate('local')(req, res, function () {
                        res.redirect('/home');
                    });
                }
            });
        }
    });
});

//ajax call to get all usernames to be compared with user input
app.get("/getAllUsernames", function (req, res) {
    dao.getAllUsernames(function (usernames) {
        var usernamesString = JSON.stringify(usernames);
        res.status(200);
        res.type("text/plain");
        res.end(JSON.stringify(usernames));
    });
});



app.get('/login', function (req, res) {
    if (req.isAuthenticated()) {
        res.redirect("/home");
    } else {
        var data = {
            layout: 'no-nav',
            loginFail: req.query.loginFail,
            newAccountCreated: req.query.newAccountCreated
        }
        res.render('login', data);
    }
});


app.post('/login', passport.authenticate('local', {
    successRedirect: '/home',
    failureRedirect: '/login?loginFail=true'
}));

app.get('/logout', function (req, res) {
    req.logout();
    res.redirect("/home?loggedOut=true");
});

app.get('/accountAndPosts', isLoggedIn, function (req, res) {

    dao.getUser(req.user.username, function (user) {

        dao.getUserArticlesAndComments(user.username, function (articles, comments) {
            var data = {
                username: user.username,
                avatar: user.avatar,
                userData: user,
                articles: articles,
                comments: comments,
                commentDeleted: req.query.commentDeleted,
                articleDeleted: req.query.articleDeleted
            }
            res.render('accountAndPosts', data);

        });
    });

});

app.post('/account', function (req, res) {

    dao.getUser(req.user.username, function (user) {

        // generate an array of all default avatar files (1.png - 12.png)
        var defaultAvatars = ['1.png', '2.png', '3.png', '4.png', '5.png', '6.png', '7.png', '8.png', '9.png', '10.png', '11.png', '12.png'];
        // remove avatar from array if it is already set as the users avatar
        var checkIfDefaultAvatar = defaultAvatars.indexOf(user.avatar);
        // if the filename of the user's avatar is already in the arrray, then remove
        if (checkIfDefaultAvatar != -1) {
            defaultAvatars.splice(checkIfDefaultAvatar, 1);
        }

        var data = {
            layout: 'no-nav',
            passwordFail: req.query.passwordFail,
            avatar: user.avatar,
            defaultAvatars: defaultAvatars,
            userData: user
        }
        res.render('account', data);
    });
});

app.post('/accountUpdate', function (req, res) {

    // create a new formidable form object
    var form = new formidable.IncomingForm();

    // generates random string used to ensure unique filename
    var randomName = sha1(new Date().getTime());
    // used to determing if user has uploaded an avatar file or not
    var customAvatarFilename = null;

    // when file upload detected, upload file to the avatars folder
    form.on("fileBegin", function (name, file) {

        // if the filename is not empty
        if (file.name != '') {

            customAvatarFilename = randomName + file.name;
            file.path = __dirname + "/public/user-avatars-fullsize/" + customAvatarFilename;
        }
    });

    // generate resized avatar when the file has been written to disk
    form.on("end", function () {
        if (customAvatarFilename != null) {
            var avatarFullPath = __dirname + "/public/user-avatars-fullsize/" + customAvatarFilename;
            var avatarThumbPath = __dirname + "/public/default-avatars/" + customAvatarFilename;
            generateAvatars(avatarFullPath, avatarThumbPath);
        }
    });

    form.parse(req, function (err, fields, files) {

        // generate an array of the additional avatar files (2.png - 12.png)
        var defaultAvatars = ['1.png', '2.png', '3.png', '4.png', '5.png', '6.png', '7.png', '8.png', '9.png', '10.png', '11.png', '12.png'];
        // remove avatar from array if it is already set as the users avatar
        var checkIfDefaultAvatar = defaultAvatars.indexOf(fields.avatar);
        // if the filename of the user's avatar is already in the arrray, then remove
        if (checkIfDefaultAvatar != -1) {
            defaultAvatars.splice(checkIfDefaultAvatar, 1);
        }

        if (fields.password != fields.passwordCheck) {
            req.session.partialEditUserData = {
                fname: fields.fname,
                lname: fields.lname,
                dob: fields.dob,
                country: fields.country,
                username: fields.username,
                description: fields.description,
                avatar: fields.avatar
            }
            var data = {
                layout: 'no-nav',
                passwordFail: true,
                defaultAvatars: defaultAvatars,
                userData: req.session.partialEditUserData
            }
            res.render('account', data);
        } else {

            if (customAvatarFilename != null) {
                fields.avatar = customAvatarFilename;
            }

            dao.updateUser(fields, function () {
                delete req.session.partialEditUserData;
                res.redirect('/home?accountUpdated=true');
            });
        }
    });
});

app.post('/deleteUser', function (req, res) {

    dao.deleteUser(req.user.username, function () {
        req.logout();
        res.redirect("/home?userDeleted=true");
    });

});


//------------------------------------------------------------------------------

//-----Routes for Gallery and Multimedia----------------------------------------

// this route handles the processing of all images and creates an array of all media files
// which are passed to the gallery view @martin
app.get('/gallery', function (req, res) {
    var username = null;
    if (req.isAuthenticated()) {
        username = req.user.username;
    }

    // get user avatar to be displayed in the nav-bar
    dao.getUser(username, function (user) {
        dao.getAllArticles(function (articles) {

            // this variable stores an array of media from only the currently logged in user
            var currentUsersMedia = [];
            // this variable stores an array of media from ALL users 
            var allUsersMedia = [];

            for (var i = 0; i < articles.length; i++) {

                var content = articles[i].content;
                var articleId = articles[i].articleId;
                var author = articles[i].author;

                // regex to scan the article content for images uploaded to our server
                var imageRegex = new RegExp('\\/uploads\\/images\\/[0-9a-z]+(.png|.jpg|.jpeg|.gif|.svg)', 'gi');
                // check content for any matches with the regex and store in an array
                var editorImages = content.match(imageRegex);

                // if the regex found only one image in the article content
                if (editorImages != null && editorImages.length == 1) {
                    // remove the path in-front of the file name
                    var justTheFilename = editorImages[0].replace('/uploads/images/', '');
                    // handle gif files separately as they do not have resized thumbnails
                    if (justTheFilename.indexOf('.gif') != -1) {
                        allUsersMedia.push({ id: articleId, gifFilename: justTheFilename });
                        if (username == author) {
                            currentUsersMedia.push({ id: articleId, gifFilename: justTheFilename });
                        }
                    } else {
                        allUsersMedia.push({ id: articleId, imageFilename: justTheFilename });
                        if (username == author) {
                            currentUsersMedia.push({ id: articleId, imageFilename: justTheFilename });
                        }
                    }
                    // else if the regex found more than one match in the article content
                } else if (editorImages != null && editorImages.length > 1) {

                    for (var j = 0; j < editorImages.length; j++) {
                        // remove the path in-front of the file name
                        var justTheFilename = editorImages[j].replace('/uploads/images/', '');
                        // handle gif files separately as they do not have resized thumbnails
                        if (justTheFilename.indexOf('.gif') != -1) {
                            allUsersMedia.push({ id: articleId, gifFilename: justTheFilename });
                            if (username == author) {
                                currentUsersMedia.push({ id: articleId, gifFilename: justTheFilename });
                            }
                        } else {
                            allUsersMedia.push({ id: articleId, imageFilename: justTheFilename });
                            if (username == author) {
                                currentUsersMedia.push({ id: articleId, imageFilename: justTheFilename });
                            }
                        }
                    }
                }

                // regex to scan the article for embedded youtube links
                var youtubeRegex = new RegExp('youtube.com\\/embed\\/.+?(?=\\?)', 'g');
                // check content for any matches with the regex and store in an array
                var editorYoutube = content.match(youtubeRegex);

                // if the regex found only one image in the article content
                if (editorYoutube != null && editorYoutube.length == 1) {
                    // remove the path in-front of the youtube id#
                    var justTheYouTubeId = editorYoutube[0].replace('youtube.com/embed/', '');

                    allUsersMedia.push({ id: articleId, youtubeId: justTheYouTubeId });
                    if (username == author) {
                        currentUsersMedia.push({ id: articleId, youtubeId: justTheYouTubeId });
                    }
                    // else if the regex found more than one match in the article content  
                } else if (editorYoutube != null && editorYoutube.length > 1) {
                    for (var j = 0; j < editorYoutube.length; j++) {
                        // remove the path in-front of the youtube id#
                        var justTheYouTubeId = editorYoutube[j].replace('youtube.com/embed/', '');
                        allUsersMedia.push({ id: articleId, youtubeId: justTheYouTubeId });
                        if (username == author) {
                            currentUsersMedia.push({ id: articleId, youtubeId: justTheYouTubeId });
                        }
                    }
                }

                // video/audio uploads are stored in the database
                var videoUpload = articles[i].video;
                var audioUpload = articles[i].audio;

                // if there is a video filename in the database
                if (videoUpload != null) {
                    allUsersMedia.push({ id: articleId, videoFilename: videoUpload });
                    if (username == author) {
                        currentUsersMedia.push({ id: articleId, videoFilename: videoUpload });
                    }
                    // else if there is a audio filename in the database    
                } else if (audioUpload != null) {
                    allUsersMedia.push({ id: articleId, audioFilename: audioUpload });
                    if (username == author) {
                        currentUsersMedia.push({ id: articleId, audioFilename: audioUpload });
                    }
                }
            }

            var gallery = allUsersMedia;
            var isUserView = false;

            // if query in the request is for the user's own gallery, set the 'gallery' 
            // array as the array of the user's uploaded media.
            if (req.query.show == 'usergallery' && username != null) {
                gallery = currentUsersMedia;
                isUserView = true;
            }

            // used to ensure avatar image displays correctly in gallery view
            if (user == null) {
                var avatar = null;
            } else {
                avatar = user.avatar;
            }

            var data = {
                username: username,
                avatar: avatar,
                gallery: gallery,
                isUserView: isUserView,
            }

            res.render('gallery', data);

        });
    });
});

// function to check if there are new images uploaded on the server that require thumbnails
function checkForImages() {

    var fullsizeFolder = __dirname + "/public/uploads/images/";
    var thumbFolder = __dirname + "/public/uploads/thumbnails/";

    // generate an array of all files in the images folder
    var existingFullsize = fs.readdirSync(fullsizeFolder);
    // generate an array of all files in the thumbnails folder
    var existingThumbs = fs.readdirSync(thumbFolder);

    for (var i = 0; i < existingFullsize.length; i++) {

        var fullsizeImg = existingFullsize[i];

        // if the image filename already exists in thumbnail folder
        if (!(existingThumbs.includes(fullsizeImg))) {

            // variable used to handle case if file extension is uppercase e.g. .JPG
            var imgLowercase = fullsizeImg.toLowerCase();

            if (imgLowercase.endsWith(".png") || imgLowercase.endsWith(".bmp") ||
                imgLowercase.endsWith(".jpg") || imgLowercase.endsWith(".jpeg")) {

                var inputFileName = fullsizeFolder + fullsizeImg;
                var outputFileName = thumbFolder + fullsizeImg;
                console.log("resizing a file...")
                generateThumbs(inputFileName, outputFileName, 200, 200);

            }
        }
    }
}

// function to generate thumbnail images for the gallery view
function generateThumbs(inputFilePath, outputFilePath, width, height) {
    var thumbWidth = width;
    var thumbHeight = height;

    // read the fullsize image folder
    jimp.read(inputFilePath, function (err, image) {
        // when jimp loads image, generate thumb & save to thumbnails folder
        image
            .scaleToFit(thumbWidth, thumbHeight)
            .write(outputFilePath, function (err) {
                if (err) {
                    console.error("Error saving file!");
                }
            });

    })
}

// function to generate square sized avatar images
function generateAvatars(inputFilePath, outputFilePath) {

    // read the fullsize image folder
    jimp.read(inputFilePath, function (err, image) {
        // when jimp loads image, generate thumb & save to thumbnails folder
        image
            .resize(512, 512)
            .write(outputFilePath, function (err) {
                if (err) {
                    console.error("Error saving file!");
                }
            });

    })
}

//------------------------------------------------------------------------------


//-----Routes for handling Froala file uploads---------------------------------

// route handler for saving images from Froala editor:
app.post("/image_upload", function (req, res) {

    upload_image(req, function (err, data) {

        if (err) {
            return res.status(404).end(JSON.stringify(err));
        }
        res.send(data);
    });
});
//Listen to the delete image request.
app.post('/delete_image', function (req, res) {

    // Do delete.
    FroalaEditor.Image.delete(req.body.src, function (err) {

        if (err) {
            return res.status(404).end(JSON.stringify(err));
        }

        return res.end();
    });
});

//------------------------------------------------------------------------------

// Serve files form "/public" folder
app.use(express.static(__dirname + "/public"));
app.use(express.static(__dirname + "/"));

// --------------------------------------------------------------------------

// 404 page
app.use(function (req, res) {
    res.type('text/html');
    res.status(404);
    res.send('Page not found :( <a href="/">Click here</a> to return to the homepage.');
});

// 500 page
app.use(function (req, res) {
    res.type('text/html');
    res.status(500);
    res.send("500 Internal Server Error. Sorry our bad, we're still learning. <a href="/">Click here</a> to return to the homepage.");
});

// Start the server running.
app.listen(app.get('port'), function () {
    console.log('Express started on http://localhost:' + app.get('port'));
});