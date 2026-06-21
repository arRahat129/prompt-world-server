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
        const bookmarkCollection = database.collection("bookmarks");


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

        app.get('/api/reviews/user/:reviewerId', async (req, res) => {
            try {
                const { reviewerId } = req.params;

                if (!reviewerId) {
                    return res.status(400).send({
                        success: false,
                        message: "Missing required parameter: reviewerId"
                    });
                }

                const query = { reviewerId: reviewerId };

                // Retrieves the user's reviews sorted from newest to oldest
                const userReviews = await reviewCollection
                    .find(query)
                    .sort({ createdAt: -1 })
                    .toArray();

                res.status(200).send({
                    success: true,
                    count: userReviews.length,
                    data: userReviews
                });
            } catch (error) {
                console.error("Error retrieving user-specific reviews:", error);
                res.status(500).send({ success: false, message: "Internal Server Error" });
            }
        });
        


        app.post('/api/reviews', async (req, res) => {
            try {
                const reviewData = req.body;

                if (!reviewData.promptId || !reviewData.reviewerId || !reviewData.rating || !reviewData.comment) {
                    return res.status(400).send({
                        success: false,
                        message: "Missing required parameters (promptId, reviewerId, rating, or comment)."
                    });
                }

                const existingReview = await reviewCollection.findOne({
                    promptId: reviewData.promptId,
                    reviewerId: reviewData.reviewerId
                });

                if (existingReview) {
                    // 2. If it exists, update it using its unique review _id
                    const queryFilter = { _id: existingReview._id };
                    const updatePayload = {
                        $set: {
                            rating: Number(reviewData.rating),
                            comment: reviewData.comment,
                            createdAt: new Date()
                        }
                    };

                    await reviewCollection.updateOne(queryFilter, updatePayload);

                    return res.status(200).send({
                        success: true,
                        message: "Your existing review has been updated successfully!"
                    });

                } else {
                    const newReview = {
                        promptId: reviewData.promptId,
                        promptName: reviewData.promptName || "",
                        promptDescription: reviewData.promptDescription || "",
                        creatorId: reviewData.creatorId || "",
                        rating: Number(reviewData.rating),
                        comment: reviewData.comment,
                        reviewerId: reviewData.reviewerId,
                        reviewerName: reviewData.reviewerName,
                        reviewerImage: reviewData.reviewerImage,
                        createdAt: new Date()
                    };

                    const result = await reviewCollection.insertOne(newReview);

                    return res.status(200).send({
                        success: true,
                        insertedId: result.insertedId,
                        message: "Review submitted successfully!"
                    });
                }

            } catch (error) {
                console.error("Error managing review submission lifecycle:", error);
                res.status(500).send({ success: false, message: "Internal Server Error" });
            }
        });

        // app.patch('/api/reviews', async (req, res) => {
        //     try {
        //         const { reviewerId, rating, comment } = req.body;

        //         if (!reviewerId) {
        //             return res.status(400).send({
        //                 success: false,
        //                 message: "Missing identifiers (promptId or reviewerId)."
        //             });
        //         }

        //         const queryFilter = { _id: new ObjectId(reviewerId) };

        //         const updatePayload = {
        //             $set: {
        //                 rating: Number(rating),
        //                 comment: comment,
        //                 createdAt: new Date()
        //             }
        //         };

        //         const result = await reviewCollection.updateOne(queryFilter, updatePayload);

        //         if (result.matchedCount === 0) {
        //             return res.status(404).send({ success: false, message: "No matching review found to update." });
        //         }

        //         res.status(200).send({ success: true, message: "Your review has been updated successfully!" });
        //     } catch (error) {
        //         console.error("PATCH Error:", error);
        //         res.status(500).send({ success: false, message: "Internal Server Error" });
        //     }
        // });

        // Bookmarks


        app.get('/api/bookmarks', async (req, res) => {
            try {
                const { email, userId } = req.query;
                console.log(email, userId);

                if (!email && !userId) {
                    return res.status(400).send({
                        success: false,
                        message: "Missing filtering identifier query params (email, or userId..)"
                    });
                }

                const query = {};
                if (email) {
                    query.userEmail = email;
                }

                if (userId) {
                    query.userId = userId;
                }

                const bookmarks = await bookmarkCollection.find(query).sort({ createdAt: -1 }).toArray();
                console.log(bookmarks);
                res.status(200).send(bookmarks);
            }
            catch (error) {
                console.log("Error retrieving user bookmarks list layout:", error);
                res.status(500).send({ success: false, message: "Internal Server Error" });
            }
        });


        app.post('/api/bookmarks', async (req, res) => {
            try {
                const { promptId, promptTitle, promptDescription, userId, userEmail, creatorName, creatorEmail } = req.body;

                if (!promptId || !userId) {
                    return res.status(400).send({ success: false, message: "Missing required identifier fields." });
                }

                const existingBookmark = await bookmarkCollection.findOne({ promptId, userId });
                if (existingBookmark) {
                    await bookmarkCollection.deleteOne({ promptId, userId });
                    return res.status(200).send({
                        success: true,
                        isBookmarked: false,
                        message: "Bookmark removed successfully!"
                    });
                } else {
                    const newBookmark = {
                        promptId,
                        promptTitle,
                        promptDescription: promptDescription || "",
                        userId,
                        userEmail,
                        creatorName: creatorName || "Anonymous Creator",
                        creatorEmail: creatorEmail || "",
                        createdAt: new Date()
                    };
                    const result = await bookmarkCollection.insertOne(newBookmark);

                    return res.status(200).send({
                        success: true,
                        isBookmarked: true,
                        result: result,
                        message: "Prompt bookmarked successfully!"
                    });
                }
            } catch (error) {
                console.error("Bookmark Database Error:", error);
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