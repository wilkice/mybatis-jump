import * as assert from 'assert';
import { findBestMapperXmlMatch, MapperXmlFile } from '../extension';

suite('mapper XML lookup', () => {
	test('finds a mapper XML with a different filename by namespace', () => {
		const xmlFiles: MapperXmlFile[] = [
			{
				path: '/workspace/src/main/resources/mapper/UserMapper.xml',
				text: [
					'<mapper namespace="com.example.OtherMapper">',
					'	<select id="findById">',
					'		select * from other',
					'	</select>',
					'</mapper>',
				].join('\n'),
			},
			{
				path: '/workspace/src/main/resources/sql/AccountQueries.xml',
				text: [
					'<mapper namespace="com.example.AccountMapper">',
					'	<select id="findById">',
					'		select * from account',
					'	</select>',
					'</mapper>',
				].join('\n'),
			},
		];

		const javaFileName = '/workspace/src/main/java/com/example/AccountMapper.java';
		const javaText = [
			'package com.example;',
			'',
			'public interface AccountMapper {',
			'	Account findById(Long id);',
			'}',
		].join('\n');

		const match = findBestMapperXmlMatch(javaFileName, javaText, 'findById', xmlFiles);

		assert.ok(match);
		assert.strictEqual(match.file.path, '/workspace/src/main/resources/sql/AccountQueries.xml');
		assert.strictEqual(match.line, 1);
	});
});
