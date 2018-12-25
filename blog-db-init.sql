--create Blog database tables

create table Users (
    username varchar(20) not null primary key,
    password varchar(20) not null,
    dob date not null,
    country varchar(20) not null,
    avatar varchar(20) not null,
    fname varchar(20) not null,
    lname varchar(50) not null,
    activeFlag integer,
    userId integer,
    description varchar(140),
    check (activeFlag = 0 or activeFlag = 1)
);

create table Articles (
    articleId integer not null primary key autoincrement,
    author varchar(20),
    timestamp TIMESTAMP,
    title varchar(100),
    content text,
    audio varchar(20),
    video varchar(20),
    link varchar(50),
    foreign key (author) references Users (username)
);

create table Comments (
    commentId integer not null primary key autoincrement,
    articleId integer,
    author varchar(20),
    timestamp TIMESTAMP,
    content text,
    image varchar(20),
    video varchar(20),
    link varchar(50),
    foreign key (author) references Users (username),
    foreign key (articleId) references Articles (articleId)
);

insert into Users values
    ('admin', 'admin', '2018-10-23', 'New Zealand', '1.png', 'admin', 'admin', 1, 1, 'Hi, I am Admin.');
