import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString, Matches, MaxLength } from 'class-validator';

export class RunRequestDto {
  @ApiProperty({
    example: 'هاتلي 100 عيادة أسنان في التجمع معندهاش Website وعندها Social Media',
    description: 'Natural-language lead discovery request',
  })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  @Matches(/\S/, { message: 'query must not be blank' })
  query!: string;
}
