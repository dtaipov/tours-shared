const cluster = require('cluster');
const os = require('os');

// Code to run if we're in the master process
if (cluster.isMaster) {

    // Count the machine's CPUs
    const cpuCount = os.cpus().length;

    // Create a worker for each CPU
    for (let i = 0; i < cpuCount; i += 1) {
        cluster.fork();
    }

    // Listen for terminating workers
    cluster.on('exit', function (worker) {

        // Replace the terminated workers
        console.log('Worker ' + worker.id + ' died :(');
        cluster.fork();

    });

// Code to run if we're in a worker process
} else {
    const AWS = require('aws-sdk');
    const express = require('express');
    const bodyParser = require('body-parser');

    AWS.config.region = process.env.REGION

    const sns = new AWS.SNS();
    const ddb = new AWS.DynamoDB();

    const ddbTable = process.env.STARTUP_SIGNUP_TABLE;
    const requestsTable = process.env.REQUESTS_TABLE;
    const snsTopic = process.env.NEW_SIGNUP_TOPIC;
    const app = express();

    app.set('view engine', 'ejs');
    app.set('views', __dirname + '/views');
    app.use(bodyParser.urlencoded({extended:false}));

    app.get('/', function(req, res) {
        const params = {
            ExpressionAttributeValues: {
                ':y': { S: '2023' },
            },
            KeyConditionExpression: 'y = :y',
            TableName: 'requests',
        };

        ddb.query(params, function(err, data) {
            if (err) {
                console.log("Error", err);
            }
            res.render('index', {requests: data?.Items});
        });
    });

    app.get('/add-request', function(req, res) {
        res.render('addRequest');
    });

    app.post('/add-request', function(req, res) {
        const item = {
            y: { S: '2023' },
            email: { S: req.body.email },
            title: { S: req.body.title },
            description: { S: req.body.description },
        };

        ddb.putItem({
            TableName: requestsTable,
            Item: item
        }, (err, data) => {
            if (err) {
                let returnStatus = 500;

                if (err.code === 'ConditionalCheckFailedException') {
                    returnStatus = 409;
                }

                res.status(returnStatus).end();
                console.log('DDB Error: ' + err);
            } else {
                res.redirect('/');
                // sns.publish({
                //     'Message': 'Name: ' + req.body.name + "\r\nEmail: " + req.body.email
                //       + "\r\nPreviewAccess: " + req.body.previewAccess
                //       + "\r\nTheme: " + req.body.theme,
                //     'Subject': 'New user sign up!!!',
                //     'TopicArn': snsTopic
                // }, function(err, data) {
                //     if (err) {
                //         res.status(500).end();
                //         console.log('SNS Error: ' + err);
                //     } else {
                //         res.status(201).end();
                //     }
                // });
            }
        });
    });

    app.post('/signup', function(req, res) {
        const item = {
            'email': {'S': req.body.email},
            'name': {'S': req.body.name},
            'preview': {'S': req.body.previewAccess},
            'theme': {'S': req.body.theme}
        };

        ddb.putItem({
            'TableName': ddbTable,
            'Item': item,
            'Expected': { email: { Exists: false } }        
        }, function(err, data) {
            if (err) {
                let returnStatus = 500;

                if (err.code === 'ConditionalCheckFailedException') {
                    returnStatus = 409;
                }

                res.status(returnStatus).end();
                console.log('DDB Error: ' + err);
            } else {
                sns.publish({
                    'Message': 'Name: ' + req.body.name + "\r\nEmail: " + req.body.email 
                                        + "\r\nPreviewAccess: " + req.body.previewAccess 
                                        + "\r\nTheme: " + req.body.theme,
                    'Subject': 'New user sign up!!!',
                    'TopicArn': snsTopic
                }, function(err, data) {
                    if (err) {
                        res.status(500).end();
                        console.log('SNS Error: ' + err);
                    } else {
                        res.status(201).end();
                    }
                });            
            }
        });
    });

    const port = process.env.PORT || 3000;

    const server = app.listen(port, function () {
        console.log('Server running at http://127.0.0.1:' + port + '/');
    });
}
