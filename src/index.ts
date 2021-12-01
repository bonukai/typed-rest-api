import _ from 'lodash';
import { OpenAPIV3 } from 'openapi-types';
import path from 'path';
import Ajv from 'ajv';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'fs';

import { Route } from './route';
import { generateOpenApiDocument } from './generators/openapi';
import { generateRoutes } from './generators/routes';
import { checkProgramForErrors, getRoutes } from './find_routes';
import configJsonSchema from './config_json_schema.json';
import { createExpressRoute, registerRoute, ValidationError } from './server';
export { createExpressRoute, registerRoute, ValidationError };

export class RouteValidationError extends Error {
  constructor(message?: string) {
    super(message);

    Object.setPrototypeOf(this, RouteValidationError.prototype);
  }
}
export class InvalidParamsType extends Error {
  constructor(message?: string) {
    super(message);

    Object.setPrototypeOf(this, InvalidParamsType.prototype);
  }
}

export type ConfigType = {
  openapi: Omit<
    OpenAPIV3.Document,
    | 'openapi'
    | 'paths'
    | 'components'
    | 'x-express-openapi-additional-middleware'
    | 'x-express-openapi-validation-strict'
  > & {
    components?: Omit<OpenAPIV3.ComponentsObject, 'schemas'>;
  };
  tsConfigPath?: string;
  schemaOutputDir?: string;
  schemaOutputFileName?: string;
  routesOutputDir?: string;
  routesOutputFileName?: string;
  generateOpenApiSchema?: boolean;
  checkProgramForErrors?: boolean;
};

const defaultConfig: Omit<ConfigType, 'openapi'> = {
  tsConfigPath: path.join(process.cwd(), 'tsconfig.json'),
  generateOpenApiSchema: true,
  checkProgramForErrors: true,
  schemaOutputDir: process.cwd(),
  schemaOutputFileName: 'openapi.json',
  routesOutputDir: path.join(process.cwd(), 'generated'),
  routesOutputFileName: 'routes.ts',
};

export const typescriptRoutesToOpenApi = (config?: ConfigType) => {
  if (!config) {
    config = loadConfigFile(defaultConfigPath());
  }

  config = {
    ...defaultConfig,
    ...config,
  };

  const ajv = new Ajv();

  if (!ajv.validate(configJsonSchema, config)) {
    throw new Error(
      `Invalid config file: ${ajv.errorsText(ajv.errors, {
        dataVar: 'Config',
      })}`
    );
  }

  overridePreviouslyGeneratedRoutesFile(config);

  const tsConfigFileFilePath = config.tsConfigPath!;

  if (config.checkProgramForErrors) {
    checkProgramForErrors(tsConfigFileFilePath);
  }

  const routes = getRoutes(tsConfigFileFilePath);

  if (config.generateOpenApiSchema ?? true) {
    _generateOpenApiDocument(config, routes);
  }

  _generateRoutes(config, routes);
};

export const defaultConfigPath = () => {
  return path.join(process.cwd(), 'typescript-routes-to-openapi.json');
};

export const loadConfigFile = (configPath: string): ConfigType => {
  if (!existsSync(configPath)) {
    throw new Error(`Config file does not exist: ${configPath}`);
  }

  if (!statSync(configPath).isFile()) {
    throw new Error(`Config needs to be a regular file: ${configPath}`);
  }

  const fileContent = readFileSync(path.resolve(configPath)).toString();
  const config = JSON.parse(fileContent);

  return config;
};

const _generateOpenApiDocument = (config: ConfigType, routes: Route[]) => {
  const schemaOutputPath = path.join(
    config.schemaOutputDir!,
    config.schemaOutputFileName!
  );

  const generatedOpenApiSchema = generateOpenApiDocument(
    routes,
    config.openapi
  );

  if (!existsSync(path.dirname(schemaOutputPath))) {
    mkdirSync(path.dirname(schemaOutputPath), {
      recursive: true,
    });
  }

  writeFileSync(schemaOutputPath, generatedOpenApiSchema);

  console.log('Generated OpenApi schema to:', schemaOutputPath);
};

const _generateRoutes = (config: ConfigType, routes: Route[]) => {
  const routesOutputDir = path.join(
    config.routesOutputDir || path.join(process.cwd(), 'generated')
  );

  const routesOutputPath = path.join(
    routesOutputDir,
    config.routesOutputFileName!
  );

  const generatedRoutesFile = generateRoutes(routes, routesOutputDir);

  if (!existsSync(routesOutputDir)) {
    mkdirSync(routesOutputDir, {
      recursive: true,
    });
  }

  writeFileSync(routesOutputPath, generatedRoutesFile);

  console.log('Generated routes to:', routesOutputPath);
};

const overridePreviouslyGeneratedRoutesFile = (config: ConfigType) => {
  const routesOutputPath = path.join(
    config.routesOutputDir!,
    config.routesOutputFileName!
  );

  if (existsSync(routesOutputPath)) {
    writeFileSync(
      routesOutputPath,
      `// This file was generated by typescript-routes-to-openapi

import express, { Router } from 'express';

const router: Router = express.Router();

export { router as generatedRoutes };`
    );
  }
};
