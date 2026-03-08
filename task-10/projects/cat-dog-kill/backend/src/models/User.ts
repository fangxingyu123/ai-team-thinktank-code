import mongoose, { Schema, Document } from 'mongoose';
import bcrypt from 'bcryptjs';

export interface IUser extends Document {
  username: string;
  password: string;
  nickname: string;
  avatar?: string;
  stats: {
    gamesPlayed: number;
    gamesWon: number;
    gamesLost: number;
    catWins: number;
    dogWins: number;
    foxWins: number;
  };
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

const UserSchema: Schema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      minlength: 3,
      maxlength: 20,
    },
    password: {
      type: String,
      required: true,
      minlength: 6,
    },
    nickname: {
      type: String,
      required: true,
      trim: true,
      minlength: 1,
      maxlength: 20,
    },
    avatar: {
      type: String,
      default: null,
    },
    stats: {
      gamesPlayed: { type: Number, default: 0 },
      gamesWon: { type: Number, default: 0 },
      gamesLost: { type: Number, default: 0 },
      catWins: { type: Number, default: 0 },
      dogWins: { type: Number, default: 0 },
      foxWins: { type: Number, default: 0 },
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// 密码加密中间件
UserSchema.pre<IUser>('save', async function (next) {
  if (!this.isModified('password')) return next();
  
  try {
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
  } catch (error) {
    next(error as Error);
  }
});

// 密码比较方法
UserSchema.methods.comparePassword = async function (
  candidatePassword: string
): Promise<boolean> {
  return bcrypt.compare(candidatePassword, this.password);
};

// 虚拟字段：胜率
UserSchema.virtual('winRate').get(function () {
  if (this.stats.gamesPlayed === 0) return 0;
  return Math.round((this.stats.gamesWon / this.stats.gamesPlayed) * 100);
});

export const User = mongoose.model<IUser>('User', UserSchema);
export default User;
