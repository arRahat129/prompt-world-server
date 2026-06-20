const express = require('express');
const cors = require('cors');
const app = express()
const port = 5000;

require('dotenv').config();

app.use(cors());
app.use(express.json())

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');

app.get('/', (req, res) => {
    res.send('Hello World!')
})


const uri = process.env.MONGO_DB_URI;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const database = client.db("prompt_world_db");
        const userCollection = database.collection("user");
        const promptCollection = database.collection("prompts");
        const reviewCollection = database.collection("reviews");


        app.get('/api/user', async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        })

        app.get('/api/prompts', async (req, res) => {
            const query = {};
            if (req.query.creatorId) {
                query.creatorId = req.query.creatorId;
            }
            if (req.query.status) {
                query.status = req.query.status;
            }

            if (req.query.search) {
                query.title = {
                    $regex: req.query.search,
                    $options: 'i',
                };
            }

            if (req.query.category) {
                query.category = {
                    $in: req.query.category.split(',')
                };
            }

            if (req.query.aiTool) {
                query.aiTool = req.query.aiTool;
            }

            if (req.query.difficulty) {
                query.difficulty = req.query.difficulty;
            }

            const cursor = promptCollection.find(query);
            const result = await cursor.toArray();
            res.send(result);
        })

        app.get('/api/prompts/:id', async (req, res) => {
            const id = req.params.id;
            const query = {
                _id: new ObjectId(id)
            }
            const result = await promptCollection.findOne(query);
            res.send(result);
        })

        app.post('/api/prompts', async (req, res) => {
            const prompt = req.body;
            const newPrompt = {
                ...prompt,
                createdAt: new Date()
            }
            const result = await promptCollection.insertOne(newPrompt);
            res.send(result);
        })

        // reviews
        app.get('/api/reviews', async (req, res) => {
            try {
                const { promptId } = req.query;

                if (!promptId) {
                    return res.status(400).send({
                        success: false,
                        message: "Missing required query parameter: promptId"
                    });
                }

                const query = { promptId: promptId };

                const reviews = await reviewCollection.find(query).sort({ createdAt: -1 }).toArray();

                res.status(200).send(reviews);
            } catch (error) {
                console.error("Error retrieving reviews collection data:", error);
                res.status(500).send({ success: false, message: "Internal Server Error" });
            }
        });


        app.post('/api/reviews', async (req, res) => {
            try {
                const reviewData = req.body;

                if (!reviewData.promptId || !reviewData.rating || !reviewData.comment) {
                    return res.status(400).send({
                        success: false,
                        message: "Missing required parameters (promptId, rating, or comment)."
                    });
                }

                const newReview = {
                    promptId: reviewData.promptId,
                    rating: Number(reviewData.rating),
                    comment: reviewData.comment,
                    reviewerId: reviewData.reviewerId,
                    reviewerName: reviewData.reviewerName,
                    reviewerImage: reviewData.reviewerImage,
                    createdAt: new Date()
                };

                const result = await reviewCollection.insertOne(newReview);
                res.status(200).send({
                    success: true,
                    insertedId: result.insertedId,
                    message: "Review submitted successfully!"
                });

            } catch (error) {
                console.error("Error creating document inside reviewCollection:", error);
                res.status(500).send({ success: false, message: "Internal Server Error" });
            }
        });

        app.patch('/api/reviews', async (req, res) => {
            try {
                const { promptId, reviewerId, rating, comment } = req.body;

                if (!promptId || !reviewerId) {
                    return res.status(400).send({
                        success: false,
                        message: "Missing identifiers (promptId or reviewerId)."
                    });
                }

                const queryFilter = { promptId, reviewerId };

                const updatePayload = {
                    $set: {
                        rating: Number(rating),
                        comment: comment,
                        createdAt: new Date()
                    }
                };

                const result = await reviewCollection.updateOne(queryFilter, updatePayload);

                if (result.matchedCount === 0) {
                    return res.status(404).send({ success: false, message: "No matching review found to update." });
                }

                res.status(200).send({ success: true, message: "Your review has been updated successfully!" });
            } catch (error) {
                console.error("PATCH Error:", error);
                res.status(500).send({ success: false, message: "Internal Server Error" });
            }
        });


        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // Ensures that the client will close when you finish/error
        // await client.close();
    }
}
run().catch(console.dir);


app.listen(port, () => {
    console.log(`Example app listening on port ${port}`)
})