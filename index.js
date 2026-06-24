const express = require('express');
const cors = require('cors');
const app = express()
const port = 5000;

require('dotenv').config();

app.use(cors());
app.use(express.json())

const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');

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

const JWKS = createRemoteJWKSet(new URL(`${process.env.CLIENT_URL}/api/auth/jwks`));

// VARIFICATION PROCESS
const verifyToken = async (req, res, next) => {
    console.log('headers', req.headers);
    const authHeader = req.headers?.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer")) {
        return res.status(401).send({ message: 'UNAUTHORIZED ACCESS' });
    }

    const token = authHeader.split(' ')[1];
    console.log(token);

    if (!token) {
        return res.status(401).send({ message: 'UNAUTHORIZED ACCESS' });
    }

    try {
        const { payload } = await jwtVerify(token, JWKS);
        console.log('payload from verify token', payload);
        req.user = payload;
        next();
    }
    catch (error) {
        console.log(error);
        return res.status(401).send({ message: 'UNAUTHORIZED ACCESS' });
    }
}

const adminVerify = async (req, res, next) => {
    const user = req.user;
    console.log(user);

    if (user?.role !== 'admin') {
        return res.status(403).json({ success: false, message: "FORBIDDEN: Administrative privileges required." });
    }
    next();
};

const appUsersVerify = async (req, res, next) => {
    const user = req.user;
    // console.log("user from seller", user);
    const allowedRoles = ['user', 'creator'];

    if (!allowedRoles.includes(user?.role)) {
        return res.status(403).json({ message: "FORBIDDEN: Access restricted to standard platform users." });
    }
    next();
}

const userVerify = async (req, res, next) => {
    const user = req.user;

    if (user?.role !== 'user') {
        return res.status(403).json({ success: false, message: "FORBIDDEN: User privileges required." });
    }
    next();
};

const proUserVerify = async (req, res, next) => {
    const user = req.user;

    if (user?.plan !== 'user_pro') {
        return res.status(401).json({ success: false, message: "FORBIDDEN: Upgrade to Pro subscription tier required to access this resource." });
    }

    next();
}

const creatorVerify = async (req, res, next) => {
    const user = req.user;

    if (user?.role !== 'creator') {
        return res.status(403).json({ success: false, message: "FORBIDDEN: Creator privileges required." });
    }
    next();
};

const proCreatorVerify = async (req, res, next) => {
    const user = req.user;

    if (user?.plan !== 'creator_pro') {
        return res.status(401).json({ success: false, message: "FORBIDDEN: Upgrade to Pro subscription tier required to access this resource." });
    }

    next();
}

async function run() {
    try {
        // Connect the client to the server	(optional starting in v4.7)
        await client.connect();

        const database = client.db("prompt_world_db");
        const userCollection = database.collection("user");
        const promptCollection = database.collection("prompts");
        const reviewCollection = database.collection("reviews");
        const bookmarkCollection = database.collection("bookmarks");
        const planCollection = database.collection("plans");
        const paymentCollection = database.collection("payments");
        const rejectionCollection = database.collection("rejections");
        const featuredCollection = database.collection("featured_prompts");


        // USER RELATED API'S
        app.get('/api/user', verifyToken, adminVerify, async (req, res) => {
            const result = await userCollection.find().toArray();
            res.send(result);
        })

        app.patch('/api/user/:id/role', verifyToken, adminVerify, async (req, res) => {
            try {
                const id = req.params.id;
                const { role } = req.body;

                if (!role) {
                    return res.status(400).send({ success: false, message: "Target validation role parameter required." });
                }

                const queryFilter = { _id: new ObjectId(id) };
                const updateResult = await userCollection.updateOne(queryFilter, {
                    $set: { role: role, updatedAt: new Date() }
                });

                if (updateResult.matchedCount === 0) {
                    return res.status(404).send({ success: false, message: "No identity records match current criteria context." });
                }

                res.status(200).send({ success: true, message: "User authorization permission context altered." });
            } catch (error) {
                console.error("Role Alteration Execution Failure:", error);
                res.status(500).send({ success: false, message: "Internal Server Error" });
            }
        });

        app.delete('/api/user/:id', verifyToken, adminVerify, async (req, res) => {
            try {
                const id = req.params.id;
                const queryFilter = { _id: new ObjectId(id) };

                // Fetch original user info first if cascade deletes are needed for nested prompt assets
                const userRecord = await userCollection.findOne(queryFilter);
                if (!userRecord) {
                    return res.status(404).send({ success: false, message: "Target identity matrix pointer missing." });
                }

                // Delete main record identity entry
                const result = await userCollection.deleteOne(queryFilter);

                // Option: Cascade-delete items generated by user across associated database domains
                // await promptCollection.deleteMany({ creatorId: id });
                // await reviewCollection.deleteMany({ reviewerId: id });

                res.status(200).send({ success: true, message: "User master record collection vectors dropped." });
            } catch (error) {
                console.error("User Purge Cascade Protocol Aborted:", error);
                res.status(500).send({ success: false, message: "Internal Server Error" });
            }
        });

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

        app.get('/api/prompts/:id', verifyToken, async (req, res) => {
            const id = req.params.id;
            const query = {
                _id: new ObjectId(id)
            }
            const result = await promptCollection.findOne(query);
            res.send(result);
        })

        app.post('/api/prompts', verifyToken, appUsersVerify, async (req, res) => {
            const prompt = req.body;
            const newPrompt = {
                ...prompt,
                createdAt: new Date()
            }
            const result = await promptCollection.insertOne(newPrompt);
            res.send(result);
        })

        app.patch('/api/prompts/:id/approve', verifyToken, adminVerify, async (req, res) => {
            try {
                const id = req.params.id;
                const queryFilter = { _id: new ObjectId(id) };

                const updateResult = await promptCollection.updateOne(queryFilter, {
                    $set: { status: "approved", updatedAt: new Date() }
                });

                if (updateResult.matchedCount === 0) {
                    return res.status(404).send({ success: false, message: "Prompt index entry not found." });
                }

                await rejectionCollection.deleteOne({ promptId: id });

                res.status(200).send({ success: true, message: "Prompt approved; systemic rejection history cleared." });
            } catch (error) {
                console.error("Approval Execution Error:", error);
                res.status(500).send({ success: false, message: "Internal Server Error" });
            }
        });

        app.post('/api/prompts/:id/reject', verifyToken, adminVerify, async (req, res) => {
            try {
                const id = req.params.id;
                const { feedback } = req.body;

                if (!feedback || !feedback.trim()) {
                    return res.status(400).send({ success: false, message: "Explicit rejection comment logs required." });
                }

                const promptQuery = { _id: new ObjectId(id) };
                const promptData = await promptCollection.findOne(promptQuery);

                if (!promptData) {
                    return res.status(404).send({ success: false, message: "Prompt asset not found." });
                }

                await promptCollection.updateOne(promptQuery, {
                    $set: { status: "rejected", updatedAt: new Date() }
                });

                const rejectionLog = {
                    promptId: id,
                    title: promptData.title,
                    category: promptData.category,
                    aiTool: promptData.aiTool,
                    thumbnail: promptData.thumbnail,
                    creatorId: promptData.creatorId,
                    creatorEmail: promptData.creatorEmail,
                    creatorName: promptData.creatorName,
                    creatorImage: promptData.creatorImage,
                    adminFeedback: feedback,
                    rejectedAt: new Date()
                };

                await rejectionCollection.updateOne(
                    { promptId: id },
                    { $set: rejectionLog },
                    { upsert: true }
                );

                res.status(200).send({ success: true, message: "Prompt rejected. Metadata records pushed to rejection logs." });
            } catch (error) {
                console.error("Rejection Lifecycle Processing Failure:", error);
                res.status(500).send({ success: false, message: "Internal Server Error" });
            }
        });

        app.post('/api/prompts/:id/feature', verifyToken, adminVerify, async (req, res) => {
            try {
                const id = req.params.id;
                const { isFeatured } = req.body; // Expects an explicit boolean variable flag

                const promptQuery = { _id: new ObjectId(id) };

                if (isFeatured) {
                    const promptData = await promptCollection.findOne(promptQuery);
                    if (!promptData) {
                        return res.status(404).send({ success: false, message: "Master prompt index entry not found." });
                    }

                    const featuredPayload = {
                        promptId: id,
                        title: promptData.title,
                        category: promptData.category,
                        aiTool: promptData.aiTool,
                        difficulty: promptData.difficulty,
                        thumbnail: promptData.thumbnail,
                        copyCount: promptData.copyCount || 0,
                        creatorId: promptData.creatorId,
                        creatorName: promptData.creatorName,
                        featuredAt: new Date()
                    };

                    await featuredCollection.updateOne(
                        { promptId: id },
                        { $set: featuredPayload },
                        { upsert: true }
                    );

                    await promptCollection.updateOne(promptQuery, { $set: { isFeatured: true } });

                } else {
                    await featuredCollection.deleteOne({ promptId: id });
                    await promptCollection.updateOne(promptQuery, { $set: { isFeatured: false } });
                }

                res.status(200).send({ success: true, message: "Featured selection synchronization state updated." });
            } catch (error) {
                console.error("Feature Workspace Toggle Operation Failure:", error);
                res.status(500).send({ success: false, message: "Internal Server Error" });
            }
        });

        app.patch('/api/prompts/:id/copy', verifyToken, async (req, res) => {
            try {
                const id = req.params.id;
                const queryFilter = { _id: new ObjectId(id) };

                const updateResult = await promptCollection.updateOne(queryFilter, {
                    $inc: { copyCount: 1 }
                });

                if (updateResult.matchedCount === 0) {
                    return res.status(404).send({ success: false, message: "Target prompt entry not found." });
                }

                await featuredCollection.updateOne(
                    { promptId: id },
                    { $inc: { copyCount: 1 } }
                );

                res.status(200).send({ success: true, message: "Prompt copy metric incremented." });
            } catch (error) {
                console.error("Copy Analytics Sync Failure:", error);
                res.status(500).send({ success: false, message: "Internal Server Error" });
            }
        });

        app.delete('/api/prompts/:id', verifyToken, adminVerify, async (req, res) => {
            try {
                const id = req.params.id;
                const queryFilter = { _id: new ObjectId(id) };

                const result = await promptCollection.deleteOne(queryFilter);

                if (result.deletedCount === 0) {
                    return res.status(404).send({ success: false, message: "No matching record targets resolved." });
                }

                await rejectionCollection.deleteOne({ promptId: id });
                await featuredCollection.deleteOne({ promptId: id });

                res.status(200).send({ success: true, message: "Prompt configurations purged system-wide." });
            } catch (error) {
                console.error("System Hard Clean Cascade Execution Failure:", error);
                res.status(500).send({ success: false, message: "Internal Server Error" });
            }
        });

        // reviews
        app.get('/api/reviews', verifyToken, async (req, res) => {
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

        app.get('/api/reviews/user/:reviewerId', verifyToken, userVerify, async (req, res) => {
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



        app.post('/api/reviews', verifyToken, userVerify, proUserVerify, async (req, res) => {
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


        app.get('/api/bookmarks', verifyToken, async (req, res) => {
            try {
                const { userId } = req.query;
                console.log(userId);

                if (!userId) {
                    return res.status(400).send({
                        success: false,
                        message: "Missing filtering identifier query params (userId..)"
                    });
                }

                const bookmarks = await bookmarkCollection.find({ userId }).sort({ createdAt: -1 }).toArray();
                console.log(bookmarks);
                res.status(200).send(bookmarks);
            }
            catch (error) {
                console.log("Error retrieving user bookmarks list layout:", error);
                res.status(500).send({ success: false, message: "Internal Server Error" });
            }
        });

        // Get all bookmarks on a creator's prompts (Flat Data Format)
        app.get('/api/creator/bookmarks', verifyToken, creatorVerify, async (req, res) => {
            try {
                const creatorId = req.user?.id || req.user?._id;

                if (!creatorId) {
                    return res.status(400).send({ success: false, message: "Invalid creator token verification structural payload." });
                }

                const bookmarksOnMyPrompts = await bookmarkCollection.find({ creatorId }).sort({ createdAt: -1 }).toArray();

                const formattedBookmarks = bookmarksOnMyPrompts.map(bookmark => ({
                    bookmarkId: bookmark._id,
                    promptId: bookmark.promptId,
                    promptTitle: bookmark.promptTitle,
                    promptDescription: bookmark.promptDescription,
                    bookmarkedByName: bookmark.userName,
                    bookmarkedByEmail: bookmark.userEmail,
                    bookmarkedByUserId: bookmark.userId,
                    date: bookmark.createdAt
                }));

                res.status(200).send({
                    success: true,
                    count: formattedBookmarks.length,
                    data: formattedBookmarks
                });

            } catch (error) {
                console.error("Error retrieving creator prompts analytics:", error);
                res.status(500).send({ success: false, message: "Internal Server Error" });
            }
        });


        app.post('/api/bookmarks', verifyToken, userVerify, async (req, res) => {
            try {
                const { promptId, promptTitle, promptDescription, userId, userEmail, userName, creatorId, creatorName, creatorEmail } = req.body;

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
                        userName,
                        userEmail,
                        creatorId: creatorId,
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


        // plans
        app.get('/api/plans', verifyToken, async (req, res) => {
            try {
                const query = {};

                if (req.query.plan_id) {
                    // FIX: Changed query.id to query.plan_id to match your MongoDB documents
                    query.plan_id = req.query.plan_id;
                }

                const plan = await planCollection.findOne(query);

                if (!plan) {
                    return res.status(404).send({ success: false, message: "Plan not found" });
                }

                res.send(plan);
            } catch (error) {
                console.error("Error fetching plan:", error);
                res.status(500).send({ success: false, message: "Internal Server Error" });
            }
        });

        // payments
        app.get('/api/payments', verifyToken, adminVerify, async (req, res) => {
            const result = await paymentCollection.find().toArray();
            res.send(result);
        })

        app.post('/api/payments', verifyToken, appUsersVerify, async (req, res) => {
            const data = req.body;
            const payInfo = {
                ...data,
                createdAt: new Date()
            }

            const result = await paymentCollection.insertOne(payInfo);


            const filter = { email: data.email };

            const updateDocument = {
                $set: {
                    plan: data.planId
                }
            };

            const updateResult = await userCollection.updateOne(filter, updateDocument);
            res.send(updateResult);
        })

        // CREATOR ANALYTICS
        app.get('/api/creator/analytics', verifyToken, creatorVerify, async (req, res) => {
            try {
                const creatorId = req.user?.id || req.user?._id;

                if (!creatorId) {
                    return res.status(400).send({ success: false, message: "Invalid token payload" });
                }

                // 1. Fetch Raw Aggregate Values
                const totalPrompts = await promptCollection.countDocuments({ creatorId });
                const approvedPrompts = await promptCollection.countDocuments({ creatorId, status: "approved" });
                const pendingPrompts = await promptCollection.countDocuments({ creatorId, status: "pending" });
                const totalBookmarks = await bookmarkCollection.countDocuments({ creatorId });

                const copiesResult = await promptCollection.aggregate([
                    { $match: { creatorId } },
                    { $group: { _id: null, totalCopies: { $sum: { $ifNull: ["$copyCount", 0] } } } }
                ]).toArray();
                const totalCopies = copiesResult[0]?.totalCopies || 0;

                // 2. Format exact 5-Bar Summary Array for the chart
                const summaryBars = [
                    { name: 'Total Prompts', value: totalPrompts, fillKey: 'url(#barTotalPromptsGrad)' },
                    { name: 'Approved Status', value: approvedPrompts, fillKey: 'url(#barApprovedGrad)' },
                    { name: 'Pending Status', value: pendingPrompts, fillKey: 'url(#barPendingGrad)' },
                    { name: 'Total Copies', value: totalCopies, fillKey: 'url(#barCopiesGrad)' },
                    { name: 'Total Bookmarks', value: totalBookmarks, fillKey: 'url(#barBookmarksGrad)' }
                ];

                // 3. Growth Timeline Data (Remains intact per your requirement)
                const [growthData] = await promptCollection.aggregate([
                    { $match: { creatorId } },
                    {
                        $facet: {
                            promptGrowth: [
                                {
                                    $group: {
                                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                                        count: { $sum: 1 }
                                    }
                                }
                            ],
                            copyGrowth: [
                                {
                                    $group: {
                                        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
                                        copies: { $sum: { $ifNull: ["$copyCount", 0] } }
                                    }
                                }
                            ]
                        }
                    }
                ]).toArray();

                const timelineMap = {};
                growthData?.promptGrowth?.forEach(item => {
                    if (item._id) timelineMap[item._id] = { date: item._id, prompts: item.count, copies: 0 };
                });
                growthData?.copyGrowth?.forEach(item => {
                    if (item._id) {
                        if (!timelineMap[item._id]) timelineMap[item._id] = { date: item._id, prompts: 0, copies: item.copies };
                        else timelineMap[item._id].copies = item.copies;
                    }
                });

                const chartData = Object.values(timelineMap).sort((a, b) => a.date.localeCompare(b.date));

                res.status(200).send({
                    success: true,
                    summary: { totalPrompts, totalCopies, totalBookmarks },
                    summaryBars, // This feeds our new 5-bar structure
                    chartData
                });

            } catch (error) {
                console.error("Error generating creator metrics:", error);
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