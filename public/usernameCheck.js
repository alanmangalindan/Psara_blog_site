"use strict";

//ajax call to get all usernames to be compared with user input
function getAllUsernames () {
    $.get("/getAllUsernames", function (data, status) {
        $('#usernameCheck').hide();

        var usernames = JSON.parse(data);

        var usernameTyped = $('#username').val();

        for (var i = 0; i < usernames.length; i++) {
            if (usernameTyped == usernames[i].username) {
                $('#usernameCheck').show();
                break;
            }
        }

    });
}

//when document is ready, check text typed in username field
$(document).ready(function () {

    $('#username').on('input', getAllUsernames);

});