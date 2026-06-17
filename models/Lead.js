import mongoose from "mongoose";

const leadSchema = new mongoose.Schema({
  senderId: {
    type: String,
    required: true,
    index: true,
  },
  name: {
    type: String,
    default: "",
  },
  phone: {
    type: String,
    default: "",
  },
  email: {
    type: String,
    default: "",
  },
  status: {
    type: String,
    enum: ["collecting_name", "collecting_phone", "collecting_email", "completed"],
    default: "collecting_name",
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

const Lead = mongoose.model("Lead", leadSchema);

export default Lead;
