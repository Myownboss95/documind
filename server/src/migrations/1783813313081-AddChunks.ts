import { MigrationInterface, QueryRunner } from "typeorm";

export class AddChunks1783813313081 implements MigrationInterface {
    name = 'AddChunks1783813313081'

    public async up(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`CREATE TABLE "chunks" ("id" uuid NOT NULL DEFAULT uuid_generate_v4(), "index" integer NOT NULL, "content" text NOT NULL, "document_id" uuid NOT NULL, CONSTRAINT "PK_a306e60b8fdf6e7de1be4be1e6a" PRIMARY KEY ("id"))`);
        await queryRunner.query(`CREATE INDEX "IDX_d841de45a719fe1f35213d7920" ON "chunks"  ("document_id") `);
        await queryRunner.query(`ALTER TABLE "chunks" ADD CONSTRAINT "FK_d841de45a719fe1f35213d79207" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE NO ACTION`);
    }

    public async down(queryRunner: QueryRunner): Promise<void> {
        await queryRunner.query(`ALTER TABLE "chunks" DROP CONSTRAINT "FK_d841de45a719fe1f35213d79207"`);
        await queryRunner.query(`DROP INDEX "public"."IDX_d841de45a719fe1f35213d7920"`);
        await queryRunner.query(`DROP TABLE "chunks"`);
    }

}
