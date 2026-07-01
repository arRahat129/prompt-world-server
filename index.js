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
    // console.log('headers', req.headers);
    const authHeader = req.headers?.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer")) {
        return res.status(401).send({ message: 'UNAUTHORIZED ACCESS' });
    }

    const token = authHeader.split(' ')[1];
    // console.log(token);

    if (!token) {
        return res.status(401).send({ message: 'UNAUTHORIZED ACCESS' });
    }

    try {
        const { payload } = await jwtVerify(token, JWKS);
        // console.log('payload from verify token', payload);
        req.user = payload;
        next();
    }
    catch (error) {
        // console.log(error);
        return res.status(401).send({ message: 'UNAUTHORIZED ACCESS' });
    }
}

const adminVerify = async (req, res, next) => {
    const user = req.user;
    // console.log(user);

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

// async function run() {
//     try {
//         // Connect the client to the server	(optional starting in v4.7)
//         await client.connect();

client.connect(() => {
    // console.log('connecting to MOngo db');
}).catch(console.dir)

const database = client.db("prompt_world_db");
const userCollection = database.collection("user");
const promptCollection = database.collection("prompts");
const reviewCollection = database.collection("reviews");
const bookmarkCollection = database.collection("bookmarks");
const planCollection = database.collection("plans");
const paymentCollection = database.collection("payments");
const rejectionCollection = database.collection("rejections");
const featuredCollection = database.collection("featured_prompts");
const reportCollection = database.collection("reports");
const feedbackCollection = database.collection("feedbacks");


// USER RELATED API'S
app.get('/api/user', verifyToken, adminVerify, async (req, res) => {
    try {
        const query = {};

        if (req.query.page) {
            const page = parseInt(req.query.page) || 1;
            const perPage = parseInt(req.query.perPage) || 10;
            const skipItems = (page - 1) * perPage;

            const total = await userCollection.countDocuments(query);
            const users = await userCollection.find(query)
                .skip(skipItems)
                .limit(perPage)
                .toArray();

            return res.send({ total, users });
        }

        const result = await userCollection.find(query).toArray();
        res.send(result);
    } catch (error) {
        console.error("Failed to read user registry entries:", error);
        res.status(500).send({ message: "Internal Server Execution Fault" });
    }
});

app.get('/api/user/:id', verifyToken, async (req, res) => {
    try {
        const userId = req.params.id;

        if (!ObjectId.isValid(userId)) {
            return res.status(400).send({ message: "Invalid User ID format provided." });
        }

        const query = { _id: new ObjectId(userId) };
        const user = await userCollection.findOne(query);

        if (!user) {
            return res.status(404).send({ message: "Requested user entry could not be found." });
        }

        if (user.password) {
            delete user.password;
        }

        res.send(user);

    } catch (error) {
        console.error("Failed to read single user record from registry:", error);
        res.status(500).send({ message: "Internal Server Execution Fault" });
    }
});

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

        const userRecord = await userCollection.findOne(queryFilter);
        if (!userRecord) {
            return res.status(404).send({ success: false, message: "Target identity matrix pointer missing." });
        }

        const result = await userCollection.deleteOne(queryFilter);

        res.status(200).send({ success: true, message: "User master record collection vectors dropped." });
    } catch (error) {
        console.error("User Purge Cascade Protocol Aborted:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});

// PROMPTS
app.get('/api/prompts', async (req, res) => {
    const query = {};
    const sort = {};

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

    if (req.query.sortBy) {
        const sortBy = req.query.sortBy;
        const order = req.query.order === 'desc' ? -1 : 1;
        sort[sortBy] = order;
    } else {
        sort.createdAt = -1;
    }

    if (req.query.page) {
        const page = parseInt(req.query.page) || 1;
        const perPage = parseInt(req.query.perPage) || 12;
        const skipItems = (page - 1) * perPage;

        const total = await promptCollection.countDocuments(query);
        const cursor = promptCollection.find(query).sort(sort).skip(skipItems).limit(perPage);
        const prompts = await cursor.toArray();

        return res.send({ total, prompts });
    }

    const cursor = promptCollection.find(query).sort(sort).collation({ locale: 'en', strength: 2 });
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

// For the leaderboard
app.get('/api/creators/leaderboard', async (req, res) => {
    try {
        const leaderboard = await userCollection.aggregate([
            {
                $match: {
                    role: { $ne: "admin" }
                }
            },
            {
                $lookup: {
                    from: "prompts",
                    let: { userStrId: { $toString: "$_id" } },
                    pipeline: [
                        {
                            $match: {
                                $expr: {
                                    $eq: ["$creatorId", "$$userStrId"]
                                }
                            }
                        }
                    ],
                    as: "userPrompts"
                }
            },
            {
                $addFields: {
                    totalPrompts: { $size: "$userPrompts" }
                }
            },
            {
                $project: {
                    _id: 1,
                    name: 1,
                    image: 1,
                    totalPrompts: 1
                }
            },
            {
                $sort: { totalPrompts: -1 }
            },
            {
                $limit: 10
            }
        ]).toArray();

        res.status(200).send({
            success: true,
            data: leaderboard
        });

    } catch (error) {
        console.error("Leaderboard Processing Failure:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});

app.get('/api/platform-stats', async (req, res) => {
    try {
        const statsAggregation = await promptCollection.aggregate([
            {
                $group: {
                    _id: null,
                    totalPrompts: { $sum: 1 },
                    totalCopies: { $sum: "$copyCount" },
                    uniqueTools: { $addToSet: "$aiTool" },
                    uniqueCategories: { $addToSet: "$category" }
                }
            },
            {
                $project: {
                    _id: 0,
                    totalPrompts: 1,
                    totalGenerations: "$totalCopies",
                    totalToolsCount: { $size: "$uniqueTools" },
                    totalCategoriesCount: { $size: "$uniqueCategories" }
                }
            }
        ]).toArray();

        const dynamicStats = statsAggregation[0] || {
            totalPrompts: 0,
            totalGenerations: 0,
            totalToolsCount: 0,
            totalCategoriesCount: 0
        };

        res.status(200).send({
            success: true,
            data: dynamicStats
        });
    } catch (error) {
        console.error("Error generating dynamic platform statistics:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});

app.post('/api/prompts', verifyToken, appUsersVerify, async (req, res) => {
    const prompt = req.body;
    const newPrompt = {
        ...prompt,
        createdAt: new Date()
    }
    const result = await promptCollection.insertOne(newPrompt);
    res.send(result);
})


app.patch('/api/prompts/:id', verifyToken, appUsersVerify, async (req, res) => {
    try {
        const id = req.params.id;
        const queryFilter = { _id: new ObjectId(id) };

        const existingPrompt = await promptCollection.findOne(queryFilter);
        if (!existingPrompt) {
            return res.status(404).send({ success: false, message: "Prompt asset not found." });
        }

        if (existingPrompt.creatorId !== req.user?.id) {
            return res.status(403).send({
                success: false,
                message: "Forbidden: You are not authorized to modify this prompt matrix."
            });
        }

        const {
            title,
            category,
            aiTool,
            tags,
            description,
            content,
            difficulty,
            visibility,
            thumbnail
        } = req.body;

        const updatePayload = {};

        if (title !== undefined) updatePayload.title = title;
        if (category !== undefined) updatePayload.category = category;
        if (aiTool !== undefined) updatePayload.aiTool = aiTool;
        if (tags !== undefined) updatePayload.tags = tags;
        if (description !== undefined) updatePayload.description = description;
        if (content !== undefined) updatePayload.content = content;
        if (difficulty !== undefined) updatePayload.difficulty = difficulty;
        if (visibility !== undefined) updatePayload.visibility = visibility;
        if (thumbnail !== undefined) updatePayload.thumbnail = thumbnail;

        if (Object.keys(updatePayload).length === 0) {
            return res.status(400).send({ success: false, message: "No updatable properties were provided." });
        }

        updatePayload.status = "pending";
        updatePayload.updatedAt = new Date();

        const result = await promptCollection.updateOne(queryFilter, {
            $set: updatePayload
        });

        if (result.modifiedCount === 0) {
            return res.status(200).send({ success: true, message: "No data changed; document remains identical." });
        }

        await rejectionCollection.deleteOne({ promptId: id });

        res.status(200).send({
            success: true,
            message: "Prompt asset updated successfully and pushed back to the review queue.",
            modifiedCount: result.modifiedCount
        });

    } catch (error) {
        console.error("Prompt Patch Update Failure:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});


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


// Featured
app.get('/api/featured-prompts', async (req, res) => {
    try {
        const result = await featuredCollection
            .find()
            .sort({ featuredAt: -1 })
            .limit(6)
            .toArray();

        res.status(200).send({
            success: true,
            count: result.length,
            data: result
        });
    } catch (error) {
        console.error("Error retrieving featured prompts:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});

app.post('/api/prompts/:id/feature', verifyToken, adminVerify, async (req, res) => {
    try {
        const id = req.params.id;
        const { isFeatured } = req.body;

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

app.delete('/api/prompts/:id', verifyToken, appUsersVerify, async (req, res) => {
    try {
        const id = req.params.id;
        const queryFilter = { _id: new ObjectId(id) };

        const existingPrompt = await promptCollection.findOne(queryFilter);
        if (!existingPrompt) {
            return res.status(404).send({ success: false, message: "Prompt asset not found." });
        }

        if (existingPrompt.creatorId !== req.user?.id) {
            return res.status(403).send({
                success: false,
                message: "Forbidden: You are not authorized to delete this prompt matrix."
            });
        }

        const mainDeleteResult = await promptCollection.deleteOne(queryFilter);

        if (mainDeleteResult.deletedCount === 0) {
            return res.status(500).send({ success: false, message: "Failed to erase primary prompt asset." });
        }

        await featuredCollection.deleteOne({ promptId: id });
        await reviewCollection.deleteMany({ promptId: id });
        await bookmarkCollection.deleteMany({ promptId: id });
        await rejectionCollection.deleteOne({ promptId: id });
        await reportCollection.deleteMany({ promptId: id });

        res.status(200).send({
            success: true,
            message: "Prompt matrix and all its associated cross-collection assets purged successfully."
        });

    } catch (error) {
        console.error("Prompt Cascade Elimination Failure:", error);
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

// For home page
app.get('/api/reviews/recent', async (req, res) => {
    try {
        const recentReviews = await reviewCollection
            .find({})
            .sort({ createdAt: -1 })
            .limit(6)
            .project({
                _id: 1,
                promptName: 1,
                promptDescription: 1,
                reviewerName: 1,
                reviewerImage: 1,
                comment: 1,
                rating: 1,
                createdAt: 1
            })
            .toArray();

        res.status(200).send({
            success: true,
            count: recentReviews.length,
            data: recentReviews
        });
    } catch (error) {
        console.error("Error retrieving recent reviews showcase data:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});



app.post('/api/reviews', verifyToken, userVerify, async (req, res) => {
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
        // console.log(userId);

        if (!userId) {
            return res.status(400).send({
                success: false,
                message: "Missing filtering identifier query params (userId..)"
            });
        }

        const bookmarks = await bookmarkCollection.find({ userId }).sort({ createdAt: -1 }).toArray();
        // console.log(bookmarks);
        res.status(200).send(bookmarks);
    }
    catch (error) {
        // console.log("Error retrieving user bookmarks list layout:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});

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

    if (!data.userId) {
        return res.status(400).send({ success: false, message: "User ID is required." });
    }

    try {
        const existingPayment = await paymentCollection.findOne({ userId: data.userId });

        if (existingPayment) {
            return res.status(400).send({
                success: false,
                message: "This account has already completed a premium plan payment."
            });
        }

        const payInfo = {
            userId: data.userId,
            planId: data.planId,
            email: data.email,
            createdAt: new Date()
        };
        const paymentResult = await paymentCollection.insertOne(payInfo);

        if (!ObjectId.isValid(data.userId)) {
            return res.status(400).send({ success: false, message: "Invalid User ID structure configuration." });
        }

        const filter = { _id: new ObjectId(data.userId) };
        const updateDocument = {
            $set: {
                plan: data.planId,
                updatedAt: new Date()
            }
        };

        const updateResult = await userCollection.updateOne(filter, updateDocument);

        if (updateResult.matchedCount === 0) {
            return res.status(404).send({
                success: false,
                message: "Payment logged, but corresponding user record could not be found to upgrade plans."
            });
        }

        res.status(200).send({
            success: true,
            message: "Payment processed and tier privileges synchronized successfully",
            paymentId: paymentResult.insertedId,
            updateResult
        });

    } catch (error) {
        console.error("Payment registration operation failure:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});


// REPORTS RELATED API
app.get('/api/reports', verifyToken, adminVerify, async (req, res) => {
    try {
        const query = {};

        if (req.query.targetType) {
            query.targetType = req.query.targetType;
        }

        if (req.query.page) {
            const page = parseInt(req.query.page) || 1;
            const perPage = parseInt(req.query.perPage) || 10;
            const skipItems = (page - 1) * perPage;

            const total = await reportCollection.countDocuments(query);
            const reports = await reportCollection.find(query)
                .sort({ createdAt: -1 }) // Newest reports first
                .skip(skipItems)
                .limit(perPage)
                .toArray();

            return res.status(200).send({ total, reports });
        }

        // Default: Return all records if pagination isn't active
        const result = await reportCollection.find(query).sort({ createdAt: -1 }).toArray();
        res.status(200).send(result);
    } catch (error) {
        console.error("Failed to read platform system reporting logs:", error);
        res.status(500).send({ success: false, message: "Internal Server Execution Fault" });
    }
});


app.post('/api/reports', verifyToken, async (req, res) => {
    try {
        const { promptId, reason, reportType } = req.body;

        if (!promptId || !reason || !reportType) {
            return res.status(400).send({
                success: false,
                message: "Missing required parameters: promptId, reason, or reportType."
            });
        }

        const promptQuery = { _id: new ObjectId(promptId) };
        const promptData = await promptCollection.findOne(promptQuery);

        if (!promptData) {
            return res.status(404).send({ success: false, message: "Target prompt asset not found." });
        }

        const reporterId = req.user?.id || req.user?._id;
        const reporterName = req.user?.name || "Anonymous User";
        const reporterEmail = req.user?.email || "";
        const reporterImage = req.user?.image || "";

        if (!reporterId) {
            return res.status(401).send({ success: false, message: "User session context missing or invalid." });
        }

        const newReport = {
            reason: reason.trim(),
            reportType: reportType,

            promptId: promptId,
            promptTitle: promptData.title,
            promptCategory: promptData.category,
            promptAiTool: promptData.aiTool,
            promptThumbnail: promptData.thumbnail,
            promptDescription: promptData.description,

            creatorId: promptData.creatorId,
            creatorEmail: promptData.creatorEmail,
            creatorName: promptData.creatorName,
            creatorImage: promptData.creatorImage,

            reporterId,
            reporterName,
            reporterEmail,
            reporterImage,

            reportedAt: new Date()
        };

        const result = await reportCollection.insertOne(newReport);

        res.status(201).send({
            success: true,
            insertedId: result.insertedId,
            message: "Report logged successfully. Platform administrators will review it shortly."
        });

    } catch (error) {
        console.error("Report Lifecyle Logging Failure:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});

app.delete('/api/reports/:id', verifyToken, adminVerify, async (req, res) => {
    try {
        const reportId = req.params.id;

        // 1. Validate that the ID is a valid MongoDB ObjectId string
        if (!ObjectId.isValid(reportId)) {
            return res.status(400).send({
                success: false,
                message: "Invalid report ID format."
            });
        }

        const query = { _id: new ObjectId(reportId) };

        // 2. Perform the deletion
        const result = await reportCollection.deleteOne(query);

        // 3. Check if a document was actually deleted
        if (result.deletedCount === 0) {
            return res.status(404).send({
                success: false,
                message: "Report not found or already deleted."
            });
        }

        // 4. Return success response
        res.status(200).send({
            success: true,
            message: "Report successfully removed from the system."
        });

    } catch (error) {
        console.error("Failed to delete report log:", error);
        res.status(500).send({
            success: false,
            message: "Internal Server Execution Fault during deletion."
        });
    }
});


// FEEDBACK RELATED API
app.get('/api/feedback/creator/:creatorId', verifyToken, async (req, res) => {
    try {
        const { creatorId } = req.params;

        if (!creatorId) {
            return res.status(400).send({
                success: false,
                message: "Missing required query parameter: creatorId."
            });
        }

        const query = { creatorId: creatorId };

        const feedbackList = await feedbackCollection
            .find(query)
            .sort({ feedbackCreatedAt: -1 })
            .toArray();

        const enhancedFeedbackList = await Promise.all(
            feedbackList.map(async (feedback) => {
                let promptDetails = null;

                if (feedback.promptId) {
                    try {
                        promptDetails = await promptCollection.findOne({
                            _id: new ObjectId(feedback.promptId)
                        });
                    } catch (idError) {
                        console.error(`Invalid promptId format: ${feedback.promptId}`, idError);
                    }
                }

                return {
                    ...feedback,
                    prompt: promptDetails
                };
            })
        );

        res.status(200).send({
            success: true,
            count: enhancedFeedbackList.length,
            feedback: enhancedFeedbackList
        });

    } catch (error) {
        console.error("Failed to retrieve creator feedback notices:", error);
        res.status(500).send({
            success: false,
            message: "Internal Server Error"
        });
    }
});


app.post('/api/feedback', verifyToken, adminVerify, async (req, res) => {
    try {
        const { reportId, message } = req.body;

        if (!reportId || !message || !message.trim()) {
            return res.status(400).send({
                success: false,
                message: "Missing required parameters: reportId or admin message description."
            });
        }

        const reportQuery = { _id: new ObjectId(reportId) };
        const reportData = await reportCollection.findOne(reportQuery);

        if (!reportData) {
            return res.status(404).send({
                success: false,
                message: "Source report asset context could not be located."
            });
        }

        const newFeedback = {
            reportType: reportData.reportType,
            promptId: reportData.promptId,
            promptTitle: reportData.promptTitle,
            promptCategory: reportData.promptCategory,
            promptAiTool: reportData.promptAiTool,
            promptThumbnail: reportData.promptThumbnail,
            promptDescription: reportData.promptDescription,

            creatorId: reportData.creatorId,
            creatorEmail: reportData.creatorEmail,
            creatorName: reportData.creatorName,
            creatorImage: reportData.creatorImage,

            message: message.trim(),
            feedbackCreatedAt: new Date()
        };

        const result = await feedbackCollection.insertOne(newFeedback);

        res.status(201).send({
            success: true,
            insertedId: result.insertedId,
            message: "Feedback notice issued and successfully dispatched to the content creator."
        });

    } catch (error) {
        console.error("Feedback Generation Pipeline Failure:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});


// USER STATISTICS
app.get('/api/user/analytics', verifyToken, async (req, res) => {
    try {
        const userId = req.user?.id || req.user?._id;

        if (!userId) {
            return res.status(400).send({ success: false, message: "User session context missing." });
        }

        const myReviews = await reviewCollection.find({ reviewerId: userId }).toArray();
        const myBookmarks = await bookmarkCollection.find({ userId: userId }).toArray();


        const interactedPromptIds = new Set([
            ...myReviews.map(r => r.promptId),
            ...myBookmarks.map(b => b.promptId)
        ]);

        const asUserBars = [
            { name: 'Interacted Prompts', value: interactedPromptIds.size, fillKey: 'url(#userBarInteracted)' },
            { name: 'Reviews I Gave', value: myReviews.length, fillKey: 'url(#userBarReviews)' },
            { name: 'Bookmarks I Placed', value: myBookmarks.length, fillKey: 'url(#userBarBookmarks)' }
        ];


        const creatorTotal = await promptCollection.countDocuments({ creatorId: userId });
        const creatorApproved = await promptCollection.countDocuments({
            creatorId: userId,
            status: { $regex: /^approved$/i }
        });
        const creatorPending = await promptCollection.countDocuments({
            creatorId: userId,
            status: { $regex: /^pending$/i }
        });
        const creatorRejected = await promptCollection.countDocuments({
            creatorId: userId,
            status: { $regex: /^rejected$/i }
        });


        const copiesAggregated = await promptCollection.aggregate([
            { $match: { creatorId: userId } },
            { $group: { _id: null, total: { $sum: { $ifNull: ["$copyCount", 0] } } } }
        ]).toArray();
        const totalCopiesReceived = copiesAggregated[0]?.total || 0;


        const totalBookmarksReceived = await bookmarkCollection.countDocuments({ creatorId: userId });


        const totalReviewsReceived = await reviewCollection.countDocuments({ creatorId: userId });

        const asCreatorBars = [
            { name: 'Total Prompts Created', value: creatorTotal, fillKey: 'url(#creatorBarTotal)' },
            { name: 'Approved Prompts', value: creatorApproved, fillKey: 'url(#creatorBarApproved)' },
            { name: 'Pending Prompts', value: creatorPending, fillKey: 'url(#creatorBarPending)' },
            { name: 'Rejected Prompts', value: creatorRejected, fillKey: 'url(#creatorBarRejected)' },
            { name: 'My Prompts Copied', value: totalCopiesReceived, fillKey: 'url(#creatorBarCopies)' },
            { name: 'My Prompts Bookmarked', value: totalBookmarksReceived, fillKey: 'url(#creatorBarBookmarks)' },
            { name: 'My Prompts Reviewed', value: totalReviewsReceived, fillKey: 'url(#creatorBarReviews)' }
        ];

        res.status(200).send({
            success: true,
            asUserBars,
            asCreatorBars
        });

    } catch (error) {
        console.error("Error generating clean user analytics:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});

// CREATOR ANALYTICS
app.get('/api/creator/analytics', verifyToken, creatorVerify, async (req, res) => {
    try {
        const creatorId = req.user?.id || req.user?._id;

        if (!creatorId) {
            return res.status(400).send({ success: false, message: "Invalid token payload" });
        }

        const totalPrompts = await promptCollection.countDocuments({ creatorId });
        const approvedPrompts = await promptCollection.countDocuments({ creatorId, status: "approved" });
        const pendingPrompts = await promptCollection.countDocuments({ creatorId, status: "pending" });
        const totalBookmarks = await bookmarkCollection.countDocuments({ creatorId });

        const copiesResult = await promptCollection.aggregate([
            { $match: { creatorId } },
            { $group: { _id: null, totalCopies: { $sum: { $ifNull: ["$copyCount", 0] } } } }
        ]).toArray();
        const totalCopies = copiesResult[0]?.totalCopies || 0;

        const summaryBars = [
            { name: 'Total Prompts', value: totalPrompts, fillKey: 'url(#barTotalPromptsGrad)' },
            { name: 'Approved Status', value: approvedPrompts, fillKey: 'url(#barApprovedGrad)' },
            { name: 'Pending Status', value: pendingPrompts, fillKey: 'url(#barPendingGrad)' },
            { name: 'Total Copies', value: totalCopies, fillKey: 'url(#barCopiesGrad)' },
            { name: 'Total Bookmarks', value: totalBookmarks, fillKey: 'url(#barBookmarksGrad)' }
        ];

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
            summaryBars,
            chartData
        });

    } catch (error) {
        console.error("Error generating creator metrics:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});


// ADMIN ANALYTICS & INSIGHTS
app.get('/api/admin/analytics', verifyToken, adminVerify, async (req, res) => {
    try {
        const totalUsers = await userCollection.countDocuments();
        const totalReviews = await reviewCollection.countDocuments();

        const promptStatusCounts = await promptCollection.aggregate([
            {
                $group: {
                    _id: { $toLower: { $ifNull: ["$status", "pending"] } },
                    count: { $sum: 1 }
                }
            }
        ]).toArray();

        const promptStatusMap = { approved: 0, pending: 0, rejected: 0 };
        let totalPrompts = 0;
        promptStatusCounts.forEach(item => {
            if (item._id && item._id in promptStatusMap) {
                promptStatusMap[item._id] = item.count;
            }
            totalPrompts += item.count;
        });

        const globalCopiesResult = await promptCollection.aggregate([
            {
                $group: {
                    _id: null,
                    total: { $sum: { $ifNull: ["$copyCount", 0] } }
                }
            }
        ]).toArray();
        const totalCopies = globalCopiesResult[0]?.total || 0;

        const paymentsAggregation = await paymentCollection.aggregate([
            {
                $group: {
                    _id: null,
                    totalCount: { $sum: 1 }
                }
            }
        ]).toArray();

        const totalPaymentsCount = paymentsAggregation[0]?.totalCount || 0;
        const totalRevenue = totalPaymentsCount * 5;

        const categoryDistribution = await promptCollection.aggregate([
            { $group: { _id: "$category", value: { $sum: 1 } } },
            { $project: { name: { $ifNull: ["$_id", "Uncategorized"] }, value: 1, _id: 0 } },
            { $sort: { value: -1 } }
        ]).toArray();

        const aiToolDistribution = await promptCollection.aggregate([
            { $group: { _id: "$aiTool", value: { $sum: 1 } } },
            { $project: { name: { $ifNull: ["$_id", "Other"] }, value: 1, _id: 0 } },
            { $sort: { value: -1 } }
        ]).toArray();

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

        const rawUsers = await userCollection.find({ createdAt: { $exists: true } }, { projection: { createdAt: 1 } }).toArray();
        const rawPrompts = await promptCollection.find({ createdAt: { $exists: true } }, { projection: { createdAt: 1 } }).toArray();
        const rawPayments = await paymentCollection.find(
            { createdAt: { $exists: true } },
            { projection: { createdAt: 1 } }
        ).toArray();

        const timelineMap = {};

        const parseDateKey = (dateVal) => {
            if (!dateVal) return null;
            if (dateVal instanceof Date) return dateVal.toISOString().split('T')[0];
            if (typeof dateVal === 'string') return dateVal.split('T')[0];
            return null;
        };

        rawUsers.forEach(u => {
            const dateStr = parseDateKey(u.createdAt);
            if (dateStr) {
                if (!timelineMap[dateStr]) timelineMap[dateStr] = { date: dateStr, newUsers: 0, newPrompts: 0, revenue: 0 };
                timelineMap[dateStr].newUsers += 1;
            }
        });

        rawPrompts.forEach(p => {
            const dateStr = parseDateKey(p.createdAt);
            if (dateStr) {
                if (!timelineMap[dateStr]) timelineMap[dateStr] = { date: dateStr, newUsers: 0, newPrompts: 0, revenue: 0 };
                timelineMap[dateStr].newPrompts += 1;
            }
        });

        rawPayments.forEach(pay => {
            const dateStr = parseDateKey(pay.createdAt);
            if (dateStr) {
                if (!timelineMap[dateStr]) timelineMap[dateStr] = { date: dateStr, newUsers: 0, newPrompts: 0, revenue: 0 };
                timelineMap[dateStr].revenue += 5;
            }
        });

        const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
        const timelineChartData = Object.values(timelineMap)
            .filter(item => item.date >= thirtyDaysAgoStr)
            .sort((a, b) => a.date.localeCompare(b.date));

        res.status(200).send({
            success: true,
            summaryCards: {
                totalUsers,
                totalPrompts,
                promptsApproved: promptStatusMap.approved,
                promptsPending: promptStatusMap.pending,
                promptsRejected: promptStatusMap.rejected,
                totalReviews,
                totalCopies,
                totalPaymentsCount,
                totalRevenue
            },
            charts: {
                categoryDistribution,
                aiToolDistribution,
                timelineChartData
            }
        });

    } catch (error) {
        console.error("Critical System Admin Analytics Execution Failure:", error);
        res.status(500).send({ success: false, message: "Internal Server Error" });
    }
});

// Send a ping to confirm a successful connection
// await client.db("admin").command({ ping: 1 });
//         // console.log("Pinged your deployment. You successfully connected to MongoDB!");
//     } finally {
//         // Ensures that the client will close when you finish/error
//         // await client.close();
//     }
// }
// run().catch(console.dir);


app.listen(port, () => {
    // console.log(`Example app listening on port ${port}`)
})

module.exports = app;