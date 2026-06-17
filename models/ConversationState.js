import mongoose from "mongoose";

const conversationStateSchema = new mongoose.Schema({
  senderId: {
    type: String,
    required: true,
    index: true,
  },
  isHandedOver: {
    type: Boolean,
    default: false,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

const ConversationState = mongoose.model("ConversationState", conversationStateSchema);

export default ConversationState;
