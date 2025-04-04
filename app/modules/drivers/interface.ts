/*
 * Copyright ©️ 2018-2020 Galt•Project Society Construction and Terraforming Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka)
 *
 * Copyright ©️ 2018-2020 Galt•Core Blockchain Company
 * (Founded by [Nikolai Popeka](https://github.com/npopeka) by
 * [Basic Agreement](ipfs/QmaCiXUmSrP16Gz8Jdzq6AJESY1EAANmmwha15uR3c1bsS)).
 */

import {Stream} from "stream";

export default interface IGeesomeDriversModule {
  preview: {
    image: IDriver,
    gif: IDriver,
    text: IDriver,
    youtubeThumbnail: IDriver,
    videoThumbnail: IDriver,
  },
  metadata: {
    image: IDriver,
  },
  upload: {
    youtubeVideo: IDriver,
    archive: IDriver,
    file: IDriver,
  },
  convert: {
    videoToStreamable: IDriver,
    imageWatermark: IDriver,
  }
}

export interface IDriver {
  supportedInputs: string[];
  supportedOutputSizes: string[];

  processByPath?(path, options?): Promise<any>;

  processByStream?(inputSteam: Stream, options?): Promise<IDriverResponse>;

  processByContent?(inputContent: any, options?): Promise<IDriverResponse>;

  processBySource?(sourceLink: any, options?): Promise<IDriverResponse>;

  isInputExtensionSupported(inputExtension: string):  Promise<boolean>;
}

export enum OutputSize {
  Medium = 'medium',
  Small = 'small',
  Large = 'large'
}

export enum DriverInput {
  Stream = 'stream',
  Content = 'content',
  Source = 'source',
  Path = 'path'
}

export interface IDriverResponse {
  stream?: Stream;
  content?: any;
  path?: string;
  type?: string;
  extension?: string;
  tempPath?: string;
  processed?: boolean;
  width?: number;
  emitFinish?(callback?: () => void): void;
}
