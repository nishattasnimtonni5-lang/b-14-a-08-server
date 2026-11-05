app.post("/api/studios/:id/reviews", requireAuth, async (req, res) => {
  try {
    const { rating, comment } = req.body;

    if (
      !Number.isInteger(rating) ||
      rating < 1 ||
      rating > 5 ||
      typeof comment !== "string" ||
      !comment.trim()
    ) {
      return res.status(400).json({
        message: "Valid rating and comment are required",
      });
    }

    const db = (await connectToMongoDB()).db("studio-space");

    const studio = await db.collection("studios").findOne({
      id: req.params.id,
    });

    if (!studio) {
      return res.status(404).json({
        message: "Studio not found",
      });
    }

    const review = {
      studioId: req.params.id,
      userId: req.user.id,
      userName: req.user.name,
      rating,
      comment: comment.trim(),
      createdAt: new Date(),
    };

    await db.collection("reviews").insertOne(review);

    const result = await db.collection("reviews").aggregate([
      {
        $match: { studioId: req.params.id },
      },
      {
        $group: {
          _id: "$studioId",
          averageRating: { $avg: "$rating" },
          totalReviews: { $sum: 1 },
        },
      },
    ]).toArray();

    await db.collection("studios").updateOne(
      { id: req.params.id },
      {
        $set: {
          rating: Number(result[0].averageRating.toFixed(1)),
          reviews: result[0].totalReviews,
        },
      }
    );

    res.status(201).json({
      message: "Review submitted successfully",
    });
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Failed to submit review",
    });
  }
});

app.get("/api/studios/:id/reviews", async (req, res) => {
  try {
    const db = (await connectToMongoDB()).db("studio-space");

    const reviews = await db
      .collection("reviews")
      .find({ studioId: req.params.id })
      .sort({ createdAt: -1 })
      .toArray();

    res.status(200).json(reviews);
  } catch (error) {
    console.log(error);
    res.status(500).json({
      message: "Failed to fetch reviews",
    });
  }
});