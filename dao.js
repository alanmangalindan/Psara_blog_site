// separate file for database access functions @alan

var sqlite3 = require('sqlite3').verbose();
var db = new sqlite3.Database('blog-db.db');

// enable foreign keys on the database which is not enabled by default
db.get("PRAGMA foreign_keys = ON");

// allows us to create a nice looking date and time
var dateTime = require('node-datetime');

//----------------------Queries relating to Accounts---------------------------
module.exports.getUser = function (username, callback) {

    db.all("select * from Users where username = ?", [username], function (err, rows) {
        if (rows.length > 0) {
            //only return active users
            if (rows[0].activeFlag == 1) {
                callback(rows[0]);
            } else {
                callback(null);
            }
        } else {
            callback(null);
        }
    });
}

module.exports.createUser = function (u, callback) {
    db.run("insert into Users (username, password, dob, country, avatar, fname, lname, activeFlag, description) values (?, ?, ?, ?, ?, ?, ?, ?, ?)", [u.username, u.password, u.dob, u.country, u.avatar, u.fname, u.lname, u.activeFlag, u.description], function (err) {
        if (err) {
            console.log(err);
        }
        console.log(this.changes + " row(s) added in Users table.");
        callback(err, u);
    });

}

module.exports.updateUser = function (u, callback) {
    db.run("update Users set password = ?, dob = ?, country = ?, avatar = ?, fname = ?, lname = ?, activeFlag = ?, description = ? where username = ?", [u.password, u.dob, u.country, u.avatar, u.fname, u.lname, u.activeFlag, u.description, u.username], function (err) {
        if (err) {
            console.log(err);
        }
        console.log(this.changes + " row(s) affected in Users table.");
        callback();
    });

}

module.exports.getAllUsernames = function (callback) {
    db.all("select username from Users", function (err, rows) {
        if (rows.length > 0) {
            callback(rows);
        } else {
            callback(null);
        };
    });
}

module.exports.deleteUser = function (u, callback) {
    db.run("update Users set activeFlag = 0 where username = ?", [u], function (err) {
        if (err) {
            console.log(err);
        }
        console.log(this.changes + " row(s) affected in Users table.");
        callback();
    });
}

//-----------------------------------------------------------------------------


//----------------------Queries relating to Articles---------------------------
module.exports.getAllArticles = function (callback) {
    db.all("select a.articleId as 'articleId', a.author as 'author', a.timestamp as 'timestamp', a.title as 'title', a.content as 'content', a.audio as 'audio', a.video as 'video', a.link as 'link', u.avatar as 'avatar' " +
        "from Users u, Articles a " +
        "where u.username = a.author and u.activeFlag = 1 order by a.timestamp desc", function (err, rows) {
            callback(rows);
        });
}

module.exports.createArticle = function (a, callback) {

    var date = dateTime.create();
    var timestamp = date.format("Y-m-d H:M");

    db.run("insert into Articles (author, timestamp, title, content, audio, video, link) values (?, ?, ?, ?, ?, ?, ?)", [a.username, timestamp, a.title, a.content, a.audio, a.video, a.link], function (err) {
        if (err) {
            console.log(err);
        }
    
        console.log(this.changes + " row(s) affected in Articles table.");

        db.all("select max(articleId) as maxId from Articles", function(err, rows) {
            var articleId = rows[0].maxId;
            callback(articleId);
        });
    });
}

module.exports.getArticle = function (articleId, callback) {

    var article;
    var comments;

    db.all("select a.articleId as 'articleId', a.author as 'author', a.timestamp as 'timestamp', a.title as 'title', a.content as 'content', a.audio as 'audio', a.video as 'video', a.link as 'link', u.avatar as 'avatar' " +
    "from Users u, Articles a " +
    "where u.username = a.author and a.articleId = ?", [articleId], function (err, rows) {
    
        if (rows.length > 0) {
            article = rows[0];
        } else {
            article = null;
        }
        db.all("select c.commentId as 'commentId', c.articleId as 'articleId', c.author as 'author', c.timestamp as 'timestamp', c.content as 'content', c.image as 'image', c.video as 'video', c.link as 'link', u.avatar as 'avatar' " +
            "from Comments c, Users u where c.author = u.username " +
            "and c.articleId = ? and u.activeFlag = 1 order by timestamp desc", [articleId], function (err, rows) {
            comments = rows;
            callback(article, comments);
        });
    });
}

module.exports.updateArticle = function (articleId, newTitle, newContent, newAudio, newVideo, callback) {

    var date = dateTime.create();
    var timestamp = date.format("Y-m-d H:M");

    db.run("update Articles set title = ?, content = ?, timestamp = ?, audio = ?, video = ? where articleId = ?", [newTitle, newContent, timestamp, newAudio, newVideo, articleId], function (err) {
        if (err) {
            console.log(err);
        }
        console.log(this.changes + " row(s) affected in Articles table.");
        callback();
    });
}

module.exports.deleteArticle = function (articleId, callback) {

    db.run("delete from Comments where articleId = ?", [articleId], function (err) {
        if (err) {
            console.log(err);
        }
        console.log(this.changes + " row(s) affected in Comments table.");
        db.run("delete from Articles where articleId = ?", [articleId], function (err) {
            if (err) {
                console.log(err);
            }
            console.log(this.changes + " row(s) affected in Articles table.");
            callback();
        });
    })
}

//-----------------------------------------------------------------------------


//----------------------Queries relating to Comments---------------------------
module.exports.addComment = function (username, articleId, newComment, callback) {

    var date = dateTime.create();
    var timestamp = date.format("Y-m-d H:M");

    db.run("insert into Comments (articleId, author, timestamp, content, image, video, link) values (?, ?, ?, ?, ?, ?, ?)", [articleId, username, timestamp, newComment, "none", "none", "none"], function (err) {
        if (err) {
            console.log(err);
        }
        console.log(this.changes + " row(s) affected in Comments table.");
        callback();
    });
}

module.exports.getComment = function (commentId, callback) {

    db.all("select * from Comments where commentId = ?", [commentId], function (err, rows) {

        if (rows.length > 0) {
            callback(rows[0]);
        } else {
            callback(null);
        }

    });
}

module.exports.updateComment = function (commentId, newComment, callback) {

    var date = dateTime.create();
    var timestamp = date.format("Y-m-d H:M");

    db.run("update Comments set content = ?, timestamp = ? where commentId = ?", [newComment, timestamp, commentId], function (err) {
        if (err) {
            console.log(err);
        }
        console.log(this.changes + " row(s) affected in Comments table.");
        callback();
    });
}

module.exports.deleteComment = function (commentId, callback) {

    db.run("delete from Comments where commentId = ?", [commentId], function (err) {
        if (err) {
            console.log(err);
        }
        console.log(this.changes + " row(s) affected in Comments table.");
        callback();
    })
}

// query to display data on the user account page
module.exports.getUserArticlesAndComments = function (username, callback) {

    var articles;
    var comments;

    db.all("select articleId, author, timestamp, substr(title, 1, 25) || '...' as 'title', content,  audio, video, link " +
        "from Articles " +
        "where author = ? " +
        "order by timestamp desc ", [username], function (err, rows) {

            if (rows.length > 0) {
                articles = rows;
            } else {
                articles = null;
            }

            db.all("select commentId, articleId, author, timestamp, substr(content, 1, 30) || '...' as 'content',  image, video, link " +
                "from Comments " +
                "where author = ? " +
                "order by timestamp desc ", [username], function (err, rows) {
                    comments = rows;
                    callback(articles, comments);
                });

        });
}