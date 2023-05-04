import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Users } from 'src/user/entities/user-entity';
import { Repository } from 'typeorm';
import { UsersDto } from '../user/dtos/user.dto';
import * as bcrypt from 'bcrypt';
import { validate } from 'class-validator';
import * as jwt from 'jsonwebtoken';
import { MailerService } from '../mailer/mailer.service';

@Injectable()
export class AuthService {
  constructor(
    @InjectRepository(Users) private repo: Repository<Users>,
    private mailerService: MailerService,
  ) {}

  async createUser(body: any): Promise<Record<string, any>> {
    //Validation flag
    let isOk = false;

    //Transform body into DTO
    const usersDto = new UsersDto();
    usersDto.email = body.email;
    usersDto.password = bcrypt.hashSync(body.password, 10);

    // Validate DTO against validate function from class-validator
    await validate(usersDto).then((errors) => {
      if (errors.length > 0) {
        throw new Error('Error');
      } else {
        isOk = true;
      }
    });
    if (isOk) {
      await this.repo.save(usersDto).catch((error) => {
        isOk = false;
        throw new Error('Error');
      });
      if (isOk) {
        return { status: 201, content: { msg: `User created with success` } };
      } else {
        return { status: 400, content: { msg: 'User already exists' } };
      }
    } else {
      return { status: 400, content: { msg: 'Invalid content' } };
    }
  }

  async login(user: any): Promise<Record<string, any>> {
    let isOk = false;
    const userDto = new UsersDto();
    userDto.email = user.email;
    userDto.password = user.password;

    await validate(userDto).then((errors) => {
      if (errors.length > 0) {
        throw new Error('Error');
      } else {
        isOk = true;
      }
    });

    if (isOk) {
      // Get user information
      const userDetails = await this.repo.findOne({
        where: { email: user.email },
      });
      if (userDetails == null) {
        return { status: 401, msg: { msg: 'Invalid credentials' } };
      }
      // Check if the given password match with saved password
      const isValid = bcrypt.compareSync(user.password, userDetails.password);
      if (isValid) {
        const payload = { email: user.email };
        const token = jwt.sign(payload, 'secret', { expiresIn: '15m' });
        return {
          status: 200,
          msg: {
            email: user.email,
            access_token: token,
          },
        };
      } else {
        return { status: 401, msg: { msg: 'Invalid credentials' } };
      }
    } else {
      return { status: 400, msg: { msg: 'Invalid fields.' } };
    }
  }

  // async getUserByEmail(email: string): Promise<Users> {
  //   const user = await this.repo.findOne({ where: { email } });
  //   return user;
  // }

  async logout(token: string): Promise<Record<string, any>> {
    try {
      // Verify the JWT token to get the email
      const decoded = jwt.verify(token, 'secret') as { email: string };

      // Get the user from the email
      const user = await this.getUserByEmail(decoded.email);
      if (!user) {
        throw new Error('User not found');
      }

      return { status: 200, msg: { msg: 'Logout successful' } };
    } catch (err) {
      throw new Error('Invalid token');
    }
  }

  async getUserByEmail(email: string): Promise<Users | null> {
    return await this.repo.findOne({ where: { email } });
  }

  async generateResetPasswordToken(user: Users): Promise<string> {
    const payload = { email: user.email };
    return jwt.sign(payload, 'secret', { expiresIn: '15m' });
  }

  async resetPassword(
    token: string,
    password: string,
  ): Promise<Record<string, any>> {
    let decoded: any;
    try {
      decoded = jwt.verify(token, 'secret');
    } catch (err) {
      return { status: 400, msg: { msg: 'Invalid token' } };
    }

    const user = await this.repo.findOne({
      where: { email: decoded.email },
    });

    if (!user) {
      return { status: 404, msg: { msg: 'User not found' } };
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    user.password = hashedPassword;
    await this.repo.save(user);

    return { status: 200, msg: { msg: 'Password reset successful' } };
  }
}
