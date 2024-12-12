const mongoose = require('mongoose');
const { Schema, model } = mongoose;
const fs = require('fs').promises;
const path = require('path');

// Define the Comment schema
const commentSchema = new Schema(
  {
    content: String,
    rate: Number,
    userId: String,
  },
  { timestamps: true },
);

// Define the Document schema
const documentSchema = new Schema(
  {
    id: String,
    title: String,
    type: String,
    rate: Number,
    episode: String,
    img: String,
    url: String,
    date: String,
    sub_title: String,
    comments: [commentSchema],
  },
  { timestamps: true },
);

const Comment = model('Comment', commentSchema);
const Document = model('Document', documentSchema);

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/forvera', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

async function insertData(jsonFilePath) {
  try {
    const data = await fs.readFile(path.resolve(jsonFilePath), 'utf8');
    const jsonData = JSON.parse(data);

    for (const item of jsonData) {
      const rate = ['1', '2', '3', '4', '5'].includes(item.rate)
        ? Number(item.rate)
        : null;
      const commentDate = new Date(item.commentDate);

      const comment = new Comment({
        content: item.comment,
        rate: rate,
        userId: 'defaultUserId', // Replace with actual userId if available
        createdAt: commentDate,
        updatedAt: commentDate,
      });

      const document = new Document({
        id: item.id,
        title: item.title,
        type: 'movie',
        rate: rate,
        episode: item.episode,
        img: item.img,
        url: item.url,
        date: item.year,
        sub_title: item.sub_title,
        comments: [comment],
        createdAt: commentDate,
        updatedAt: commentDate,
      });

      await document.save();
    }

    console.log('Data inserted successfully');
  } catch (err) {
    console.error('Error inserting data:', err);
  } finally {
    mongoose.connection.close();
  }
}

// Replace 'path/to/your/jsonfile.json' with the actual path to your JSON file
insertData('./result.json').catch((err) => {
  console.error('Error:', err);
  mongoose.connection.close();
});
